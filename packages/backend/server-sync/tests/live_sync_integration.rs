//! Real PG16 + Redis 7 + real `socket.io-client@4.8.3` integration tests for
//! `server-sync`:
//! - Test A: Multi-client live push (`space:broadcast-doc-updates` +
//!   `space:broadcast-doc-invalidation`), golden `v0.27.5` `space:load-doc`
//!   (`missing` + `state: "AQEN"`), DB row parity (`updates`, `doc_grants`,
//!   `runtime_doc_creators`, `storage_reconciliation_checkpoints`,
//!   `workspace_sync_permission_generations`, `sync_active_users_minutely`),
//!   and Redis invalidation + EventBus parity.
//! - Test B: Cross-node & `v0.27.5` wire-format Redis `affine:eventbus:v1`
//!   bidirectional fan-out, deduplication, and `sync.permissions.changed`
//!   subscription eviction.

use std::{path::PathBuf, process::Stdio, time::Duration};

use futures_util::StreamExt;
use postgres::{Client, NoTls};
use redis::AsyncCommands;
use serde_json::{Value, json};
use server_db::{DbConfig, ServerDb};
use server_sync::{
  SyncConfig, SyncServer,
  eventbus::{EVENTBUS_CHANNEL_V1, INVALIDATION_CHANNEL_V1},
};
use test_db_harness::{pg::PgCluster, redis::TestRedis};
use tokio::{io::AsyncWriteExt, net::TcpListener, process::Command};
use uuid::Uuid;
use y_octo::HashMapExt;

const GOLDEN_UPDATE_B64: &str = "AQIBACgBBG1ldGEFdGl0bGUBdwZwYXJpdHkEAQdjb250ZW50DGhlbGxvIHBhcml0eQA=";
const GOLDEN_STATE_B64: &str = "AQEN";
const EMPTY_SHA256: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

struct EmptyDbGuard {
  admin_url: String,
  db_name: String,
  url: String,
}

impl EmptyDbGuard {
  fn create(cluster: &PgCluster, prefix: &str) -> Self {
    let suffix = Uuid::new_v4().simple().to_string();
    let db_name = format!("test_{prefix}_{}", &suffix[..12]);
    let mut admin = Client::connect(cluster.admin_url(), NoTls).expect("connect test admin");
    admin
      .batch_execute(&format!("CREATE DATABASE \"{db_name}\""))
      .expect("create empty test database");
    let url = cluster.url_for(&db_name);
    Self {
      admin_url: cluster.admin_url().to_owned(),
      db_name,
      url,
    }
  }
}

impl Drop for EmptyDbGuard {
  fn drop(&mut self) {
    if let Ok(mut admin) = Client::connect(&self.admin_url, NoTls) {
      let _ = admin.batch_execute(&format!("DROP DATABASE IF EXISTS \"{}\" WITH (FORCE)", self.db_name));
    }
  }
}

fn locate_node_modules_root() -> PathBuf {
  if let Ok(root) = std::env::var("AFFINE_NODE_MODULES_ROOT")
    && !root.trim().is_empty()
  {
    return PathBuf::from(root);
  }
  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .unwrap()
    .parent()
    .unwrap()
    .parent()
    .unwrap()
    .to_path_buf()
}

async fn seed_user_and_workspace(db: &ServerDb) -> (String, String, String) {
  let user_id = Uuid::new_v4().to_string();
  let session_id = Uuid::new_v4().to_string();
  let user_session_id = Uuid::new_v4().to_string();
  let workspace_id = Uuid::new_v4().to_string();

  sqlx::query("INSERT INTO users(id, name, email, registered, disabled) VALUES ($1, 'Sync User', $2, true, false)")
    .bind(&user_id)
    .bind(format!("sync-{}@affine.test", &user_id[..8]))
    .execute(db.pool())
    .await
    .expect("insert user");

  sqlx::query("INSERT INTO multiple_users_sessions(id) VALUES ($1)")
    .bind(&session_id)
    .execute(db.pool())
    .await
    .expect("insert multiple_users_sessions");

  sqlx::query(
    "INSERT INTO user_sessions(id, session_id, user_id, expires_at) \
     VALUES ($1, $2, $3, now() + interval '15 days')",
  )
  .bind(&user_session_id)
  .bind(&session_id)
  .bind(&user_id)
  .execute(db.pool())
  .await
  .expect("insert user_sessions");

  sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
    .bind(&workspace_id)
    .execute(db.pool())
    .await
    .expect("insert workspace");

  sqlx::query("INSERT INTO workspace_access_policies(workspace_id) VALUES ($1)")
    .bind(&workspace_id)
    .execute(db.pool())
    .await
    .expect("insert workspace_access_policies");

  sqlx::query(
    "INSERT INTO workspace_members(id, workspace_id, user_id, role, source, state) \
     VALUES ($1, $2, $3, 'owner', 'legacy', 'active')",
  )
  .bind(format!("perm_{}", Uuid::new_v4().simple()))
  .bind(&workspace_id)
  .bind(&user_id)
  .execute(db.pool())
  .await
  .expect("insert workspace_members");

  sqlx::query(
    "INSERT INTO storage_reconciliation_checkpoints(kind, scope, status, cursor, metadata, completed_at, updated_at) \
     VALUES ('workspace_doc_lifecycle_activation', 'global', 'active', '{}'::jsonb, '{\"protocolVersion\":2}'::jsonb, clock_timestamp(), clock_timestamp()) \
     ON CONFLICT (kind, scope) DO NOTHING",
  )
  .execute(db.pool())
  .await
  .expect("seed workspace_doc_lifecycle_activation");

  (user_id, session_id, workspace_id)
}

async fn spawn_sync_server(db: ServerDb, redis_url: &str) -> (SyncServer, String, tokio::task::JoinHandle<()>) {
  let server = SyncServer::start(
    db,
    SyncConfig {
      redis_url: Some(redis_url.to_owned()),
      ..SyncConfig::default()
    },
  )
  .await;

  let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind loopback");
  let addr = listener.local_addr().expect("local addr");
  let router = server.router();
  let handle = tokio::spawn(async move {
    let _ = axum::serve(listener, router).await;
  });

  (server, format!("http://{addr}"), handle)
}

async fn run_node_socketio_script(script: &str, env_vars: &[(&str, &str)]) -> Value {
  let node_root = locate_node_modules_root();
  let node_path = node_root.join("node_modules");
  let mut cmd = Command::new("node");
  cmd
    .arg("--input-type=commonjs")
    .arg("-")
    .env("NODE_PATH", &node_path)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  for (k, v) in env_vars {
    cmd.env(k, v);
  }
  let mut child = cmd.spawn().expect("spawn node for socket.io-client@4.8.3");
  {
    let stdin = child.stdin.as_mut().expect("child stdin");
    stdin.write_all(script.as_bytes()).await.expect("write script");
  }
  let output = tokio::time::timeout(Duration::from_secs(30), child.wait_with_output())
    .await
    .expect("node socket.io-client timed out")
    .expect("node wait_with_output");

  if !output.status.success() {
    panic!(
      "node socket.io-client script failed (status={}):\nSTDOUT:\n{}\nSTDERR:\n{}",
      output.status,
      String::from_utf8_lossy(&output.stdout),
      String::from_utf8_lossy(&output.stderr)
    );
  }
  serde_json::from_slice(&output.stdout).unwrap_or_else(|e| {
    panic!(
      "invalid json from node script: {e}\nSTDOUT:\n{}\nSTDERR:\n{}",
      String::from_utf8_lossy(&output.stdout),
      String::from_utf8_lossy(&output.stderr)
    )
  })
}

fn test_runtime() -> tokio::runtime::Runtime {
  tokio::runtime::Builder::new_multi_thread()
    .worker_threads(4)
    .enable_all()
    .build()
    .expect("build tokio runtime")
}

#[test]
fn multi_client_live_push_and_v0275_db_redis_parity() {
  let cluster = PgCluster::from_env_or_docker().expect("PG16 test cluster");
  let redis = TestRedis::from_env_or_docker().expect("Redis 7 test instance");
  let empty = EmptyDbGuard::create(&cluster, "sync_a");

  let rt = test_runtime();
  rt.block_on(async {
  let db = ServerDb::connect(DbConfig::new(&empty.url))
    .await
    .expect("connect ServerDb");
  db.ensure_schema_ready().await.expect("ensure_schema_ready");

  let (user_id, session_id, workspace_id) = seed_user_and_workspace(&db).await;
  let (server, base_url, http_handle) = spawn_sync_server(db.clone(), redis.url()).await;

  // Subscribe to Redis invalidation & eventbus channels BEFORE running clients.
  let redis_client = redis::Client::open(redis.url()).expect("redis client");
  let mut pubsub = redis_client.get_async_pubsub().await.expect("redis pubsub");
  pubsub.subscribe(EVENTBUS_CHANNEL_V1).await.expect("sub eventbus");
  pubsub
    .subscribe(INVALIDATION_CHANNEL_V1)
    .await
    .expect("sub invalidation");

  let recorded_redis = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::<(String, Value)>::new()));
  let recorded_clone = std::sync::Arc::clone(&recorded_redis);
  let redis_collector = tokio::spawn(async move {
    let mut stream = pubsub.on_message();
    while let Some(msg) = stream.next().await {
      let ch = msg.get_channel_name().to_owned();
      if let Ok(raw) = msg.get_payload::<String>()
        && let Ok(val) = serde_json::from_str::<Value>(&raw)
      {
        recorded_clone.lock().await.push((ch, val));
      }
    }
  });

  let script = r#"
const { io } = require('socket.io-client');

const url = process.env.SYNC_URL;
const cookie = process.env.SYNC_COOKIE;
const workspaceId = process.env.WORKSPACE_ID;
const updateB64 = process.env.GOLDEN_UPDATE;

function connectClient() {
  return new Promise((resolve, reject) => {
    const s = io(url, {
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
      extraHeaders: { Cookie: cookie },
    });
    const timer = setTimeout(() => reject(new Error('connect timeout')), 10000);
    s.on('connect', () => {
      clearTimeout(timer);
      resolve(s);
    });
    s.on('connect_error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitForEvent(socket, eventName, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`timeout waiting for ${eventName}`));
    }, 10000);
    const handler = payload => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(eventName, handler);
      resolve(payload);
    };
    socket.on(eventName, handler);
  });
}

function emitAck(socket, eventName, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ack for ${eventName}`)), 10000);
    socket.emit(eventName, payload, res => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

(async () => {
  const clientA = await connectClient();
  const clientB = await connectClient();

  const initialTransportA = clientA.io.engine.transport.name;

  // Both clients join workspace + parity-self-doc.
  const joinA = await emitAck(clientA, 'space:join-batch', {
    spaces: [
      { spaceType: 'workspace', spaceId: workspaceId, docId: workspaceId },
      { spaceType: 'workspace', spaceId: workspaceId, docId: 'parity-self-doc' },
    ],
    clientVersion: '0.27.5',
    protocolVersion: 2,
  });
  const joinB = await emitAck(clientB, 'space:join-batch', {
    spaces: [
      { spaceType: 'workspace', spaceId: workspaceId, docId: workspaceId },
      { spaceType: 'workspace', spaceId: workspaceId, docId: 'parity-self-doc' },
    ],
    clientVersion: '0.27.5',
    protocolVersion: 2,
  });

  // Arm event listeners on Client B BEFORE Client A pushes (no sleeps!).
  const updatesPromise = waitForEvent(clientB, 'space:broadcast-doc-updates');
  const invalidationPromise = waitForEvent(
    clientB,
    'space:broadcast-doc-invalidation',
    p => typeof p?.timestamp === 'number'
  );

  const pushAck = await emitAck(clientA, 'space:push-doc-update', {
    spaceType: 'workspace',
    spaceId: workspaceId,
    docId: 'parity-self-doc',
    update: updateB64,
    intent: 'create',
  });

  const [receivedUpdates, receivedInvalidation] = await Promise.all([
    updatesPromise,
    invalidationPromise,
  ]);

  // Re-join parity-self-doc on Client B so its permissionGeneration matches post-create generation, then load-doc.
  const rejoinB = await emitAck(clientB, 'space:join-batch', {
    spaces: [{ spaceType: 'workspace', spaceId: workspaceId, docId: 'parity-self-doc' }],
    clientVersion: '0.27.5',
    protocolVersion: 2,
  });
  const loadAck = await emitAck(clientB, 'space:load-doc', {
    spaceType: 'workspace',
    spaceId: workspaceId,
    docId: 'parity-self-doc',
  });

  const finalTransportA = clientA.io.engine.transport.name;
  const socketIdA = clientA.id;
  const socketIdB = clientB.id;

  clientA.disconnect();
  clientB.disconnect();

  console.log(JSON.stringify({
    initialTransportA,
    finalTransportA,
    socketIdA,
    socketIdB,
    joinA,
    joinB,
    pushAck,
    receivedUpdates,
    receivedInvalidation,
    rejoinB,
    loadAck,
  }));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
"#;

  let cookie = format!("affine_session={session_id}; affine_user_id={user_id}");
  let out = run_node_socketio_script(
    script,
    &[
      ("SYNC_URL", &base_url),
      ("SYNC_COOKIE", &cookie),
      ("WORKSPACE_ID", &workspace_id),
      ("GOLDEN_UPDATE", GOLDEN_UPDATE_B64),
    ],
  )
  .await;

  assert_eq!(out["joinA"]["data"]["success"], json!(true));
  assert_eq!(out["joinA"]["data"]["protocolVersion"], json!(2));
  assert_eq!(out["joinB"]["data"]["success"], json!(true));
  assert_eq!(out["pushAck"]["data"]["accepted"], json!(true));
  assert_eq!(out["pushAck"]["data"]["created"], json!(true));
  let pushed_ts = out["pushAck"]["data"]["timestamp"].as_i64().expect("timestamp");
  assert!(pushed_ts > 0);

  // Live broadcast assertions on Client B!
  assert_eq!(out["receivedUpdates"]["docId"], json!("parity-self-doc"));
  assert_eq!(out["receivedUpdates"]["spaceId"], json!(workspace_id));
  assert_eq!(out["receivedUpdates"]["updates"], json!([GOLDEN_UPDATE_B64]));
  assert_eq!(out["receivedUpdates"]["compressed"], json!(false));
  assert_eq!(out["receivedUpdates"]["timestamp"], json!(pushed_ts));
  assert_eq!(out["receivedInvalidation"]["spaceId"], json!(workspace_id));
  assert_eq!(out["receivedInvalidation"]["timestamp"], json!(pushed_ts));

  // Golden space:load-doc assertion (missing + state == "AQEN")!
  assert_eq!(out["loadAck"]["data"]["missing"], json!(GOLDEN_UPDATE_B64));
  assert_eq!(out["loadAck"]["data"]["state"], json!(GOLDEN_STATE_B64));
  assert_eq!(out["loadAck"]["data"]["timestamp"], json!(pushed_ts));

  // Verify PostgreSQL tables match v0.27.5 recorded fixture.
  let update_count: i64 =
    sqlx::query_scalar("SELECT count(*) FROM updates WHERE workspace_id = $1 AND guid = 'parity-self-doc'")
      .bind(&workspace_id)
      .fetch_one(db.pool())
      .await
      .unwrap();
  assert_eq!(update_count, 1);

  let grant_role: String = sqlx::query_scalar(
    "SELECT role::text FROM doc_grants WHERE workspace_id = $1 AND doc_id = 'parity-self-doc' AND principal_id = $2",
  )
  .bind(&workspace_id)
  .bind(&user_id)
  .fetch_one(db.pool())
  .await
  .unwrap();
  assert_eq!(grant_role, "owner");

  let creator: String = sqlx::query_scalar(
    "SELECT created_by FROM runtime_doc_creators WHERE workspace_id = $1 AND doc_id = 'parity-self-doc'",
  )
  .bind(&workspace_id)
  .fetch_one(db.pool())
  .await
  .unwrap();
  assert_eq!(creator, user_id);

  let checkpoint_meta: Value = sqlx::query_scalar(
    "SELECT metadata FROM storage_reconciliation_checkpoints WHERE kind = 'workspace_doc_lifecycle' AND scope = $1 AND status = 'completed'",
  )
  .bind(&workspace_id)
  .fetch_one(db.pool())
  .await
  .unwrap();
  assert_eq!(checkpoint_meta["protocolVersion"], json!(2));
  assert_eq!(checkpoint_meta["rootStatus"], json!("absent"));
  assert_eq!(checkpoint_meta["sourceRevision"], json!(EMPTY_SHA256));

  let generation: i64 = sqlx::query_scalar(
    "SELECT generation FROM workspace_sync_permission_generations WHERE workspace_id = $1",
  )
  .bind(&workspace_id)
  .fetch_one(db.pool())
  .await
  .unwrap();
  // 1 (workspace_access_policies) + 1 (workspace_members) + 1 (doc_grants) = 3!
  assert_eq!(generation, 3);

  // Wait briefly for disconnect flush on server to land in PG & Redis.
  let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
  loop {
    let active_users: Option<i32> = sqlx::query_scalar(
      "SELECT active_users FROM sync_active_users_minutely ORDER BY minute_ts DESC LIMIT 1",
    )
    .fetch_optional(db.pool())
    .await
    .unwrap();
    let has_disconnect_event = recorded_redis.lock().await.iter().any(|(ch, v)| {
      ch == EVENTBUS_CHANNEL_V1 && v["event"] == json!("realtime.connection.disconnected")
    });
    if active_users == Some(0) && has_disconnect_event {
      break;
    }
    assert!(
      tokio::time::Instant::now() < deadline,
      "timed out waiting for disconnect DB & Redis events (active_users={active_users:?}, has_disconnect_event={has_disconnect_event})"
    );
    tokio::time::sleep(Duration::from_millis(50)).await;
  }

  let msgs = recorded_redis.lock().await.clone();
  assert!(msgs.iter().any(|(ch, v)| {
    ch == INVALIDATION_CHANNEL_V1
      && v["kind"] == json!("workspaceInventoryChanged")
      && v["workspaceId"] == json!(workspace_id)
      && v["docId"] == json!("parity-self-doc")
      && v["version"] == json!(1)
  }));
  assert!(msgs.iter().any(|(ch, v)| {
    ch == INVALIDATION_CHANNEL_V1
      && v["kind"] == json!("blobSource")
      && v["source"]["type"] == json!("currentDoc")
      && v["source"]["docId"] == json!("parity-self-doc")
      && v["source"]["workspaceId"] == json!(workspace_id)
  }));
  assert!(msgs.iter().any(|(ch, v)| {
    ch == EVENTBUS_CHANNEL_V1
      && v["event"] == json!("sync.doc.updates.pushed")
      && v["v"] == json!(1)
      && v["originChannel"] == json!("v2:production")
      && v["id"].as_str().is_some_and(|s| s.starts_with("eb_"))
      && v["payload"]["originChannel"] == json!("v2:production")
      && v["payload"]["docId"] == json!("parity-self-doc")
      && v["payload"]["updates"] == json!([GOLDEN_UPDATE_B64])
      && v["payload"]["compressed"] == json!(false)
  }));
  assert!(msgs.iter().any(|(ch, v)| {
    ch == EVENTBUS_CHANNEL_V1
      && v["event"] == json!("realtime.connection.disconnected")
      && v["v"] == json!(1)
      && v["requestId"].is_null()
      && v["payload"]["connectionId"].as_str().is_some()
  }));

  redis_collector.abort();
  http_handle.abort();
  server.shutdown().await;
  });
}

#[test]
fn cross_node_and_v0275_wire_eventbus_bidirectional_sync() {
  let cluster = PgCluster::from_env_or_docker().expect("PG16 test cluster");
  let redis = TestRedis::from_env_or_docker().expect("Redis 7 test instance");
  let empty = EmptyDbGuard::create(&cluster, "sync_b");

  let rt = test_runtime();
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig::new(&empty.url))
      .await
      .expect("connect ServerDb");
    db.ensure_schema_ready().await.expect("ensure_schema_ready");

    let (user_id, session_id, workspace_id) = seed_user_and_workspace(&db).await;
    let (node_a, url_a, handle_a) = spawn_sync_server(db.clone(), redis.url()).await;
    let (node_b, url_b, handle_b) = spawn_sync_server(db.clone(), redis.url()).await;

    let script = r#"
const { io } = require('socket.io-client');

const urlA = process.env.URL_A;
const urlB = process.env.URL_B;
const cookie = process.env.SYNC_COOKIE;
const workspaceId = process.env.WORKSPACE_ID;
const updateB64 = process.env.GOLDEN_UPDATE;

function connectClient(url) {
  return new Promise((resolve, reject) => {
    const s = io(url, {
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
      extraHeaders: { Cookie: cookie },
    });
    const timer = setTimeout(() => reject(new Error(`connect timeout ${url}`)), 10000);
    s.on('connect', () => { clearTimeout(timer); resolve(s); });
    s.on('connect_error', err => { clearTimeout(timer); reject(err); });
  });
}

function waitForEvent(socket, eventName) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${eventName}`)), 10000);
    socket.once(eventName, payload => { clearTimeout(timer); resolve(payload); });
  });
}

function emitAck(socket, eventName, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ack for ${eventName}`)), 10000);
    socket.emit(eventName, payload, res => { clearTimeout(timer); resolve(res); });
  });
}

(async () => {
  const clientA = await connectClient(urlA);
  const clientB = await connectClient(urlB);

  await emitAck(clientA, 'space:join-batch', {
    spaces: [{ spaceType: 'workspace', spaceId: workspaceId, docId: 'cross-doc' }],
    clientVersion: '0.27.5',
    protocolVersion: 2,
  });
  await emitAck(clientB, 'space:join-batch', {
    spaces: [{ spaceType: 'workspace', spaceId: workspaceId, docId: 'cross-doc' }],
    clientVersion: '0.27.5',
    protocolVersion: 2,
  });

  // Direction 1: Node A -> Redis EventBus -> Node B -> Client B
  const bUpdatesPromise = waitForEvent(clientB, 'space:broadcast-doc-updates');
  const bInvPromise = waitForEvent(clientB, 'space:broadcast-doc-invalidation');
  const pushA = await emitAck(clientA, 'space:push-doc-update', {
    spaceType: 'workspace',
    spaceId: workspaceId,
    docId: 'cross-doc',
    update: updateB64,
    intent: 'create',
  });
  const [bUpdates, bInv] = await Promise.all([bUpdatesPromise, bInvPromise]);

  // Re-join both clients to align with post-create permission generation.
  await emitAck(clientA, 'space:join-batch', {
    spaces: [{ spaceType: 'workspace', spaceId: workspaceId, docId: 'cross-doc' }],
    clientVersion: '0.27.5',
    protocolVersion: 2,
  });
  await emitAck(clientB, 'space:join-batch', {
    spaces: [{ spaceType: 'workspace', spaceId: workspaceId, docId: 'cross-doc' }],
    clientVersion: '0.27.5',
    protocolVersion: 2,
  });

  // Direction 2: Node B -> Redis EventBus -> Node A -> Client A
  const aUpdatesPromise = waitForEvent(clientA, 'space:broadcast-doc-updates');
  const aInvPromise = waitForEvent(clientA, 'space:broadcast-doc-invalidation');
  const pushB = await emitAck(clientB, 'space:push-doc-update', {
    spaceType: 'workspace',
    spaceId: workspaceId,
    docId: 'cross-doc',
    update: updateB64,
    intent: 'update',
  });
  const [aUpdates, aInv] = await Promise.all([aUpdatesPromise, aInvPromise]);

  // Both nodes load identical doc state.
  const loadA = await emitAck(clientA, 'space:load-doc', {
    spaceType: 'workspace',
    spaceId: workspaceId,
    docId: 'cross-doc',
  });
  const loadB = await emitAck(clientB, 'space:load-doc', {
    spaceType: 'workspace',
    spaceId: workspaceId,
    docId: 'cross-doc',
  });

  clientA.disconnect();
  clientB.disconnect();

  console.log(JSON.stringify({ pushA, bUpdates, bInv, pushB, aUpdates, aInv, loadA, loadB }));
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
"#;

    let cookie = format!("affine_session={session_id}; affine_user_id={user_id}");
    let out = run_node_socketio_script(
      script,
      &[
        ("URL_A", &url_a),
        ("URL_B", &url_b),
        ("SYNC_COOKIE", &cookie),
        ("WORKSPACE_ID", &workspace_id),
        ("GOLDEN_UPDATE", GOLDEN_UPDATE_B64),
      ],
    )
    .await;

    assert_eq!(out["pushA"]["data"]["accepted"], json!(true));
    assert_eq!(out["bUpdates"]["docId"], json!("cross-doc"));
    assert_eq!(out["bUpdates"]["updates"], json!([GOLDEN_UPDATE_B64]));
    assert_eq!(out["bInv"]["spaceId"], json!(workspace_id));

    assert_eq!(out["pushB"]["data"]["accepted"], json!(true));
    assert_eq!(out["aUpdates"]["docId"], json!("cross-doc"));
    assert_eq!(out["aUpdates"]["updates"], json!([GOLDEN_UPDATE_B64]));
    assert_eq!(out["aInv"]["spaceId"], json!(workspace_id));

    assert_eq!(out["loadA"]["data"]["missing"], out["loadB"]["data"]["missing"]);
    assert_eq!(out["loadA"]["data"]["state"], json!(GOLDEN_STATE_B64));
    assert_eq!(out["loadB"]["data"]["state"], json!(GOLDEN_STATE_B64));

    // Test frozen v0.27.5 wire-format injection & sync.permissions.changed eviction on Node B.
    let wire_script = r#"
const { io } = require('socket.io-client');
const urlB = process.env.URL_B;
const cookie = process.env.SYNC_COOKIE;
const workspaceId = process.env.WORKSPACE_ID;

const s = io(urlB, {
  path: '/socket.io/',
  transports: ['websocket'],
  extraHeaders: { Cookie: cookie },
});

const updates = [];
const invalidations = [];

s.on('space:broadcast-doc-updates', p => updates.push(p));
s.on('space:broadcast-doc-invalidation', p => invalidations.push(p));

s.on('connect', () => {
  s.emit('space:join-batch', {
    spaces: [{ spaceType: 'workspace', spaceId: workspaceId, docId: 'cross-doc' }],
    clientVersion: '0.27.5',
    protocolVersion: 2,
  }, () => {
    console.log('READY');
  });
});

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (chunk.includes('CHECK')) {
    s.emit('space:load-doc', {
      spaceType: 'workspace',
      spaceId: workspaceId,
      docId: 'cross-doc',
    }, loadAfterEvict => {
      console.log(JSON.stringify({ updates, invalidations, loadAfterEvict }));
      s.disconnect();
      process.exit(0);
    });
  }
});
"#;

    let node_root = locate_node_modules_root();
    let mut child = Command::new("node")
      .arg("--input-type=commonjs")
      .arg("-e")
      .arg(wire_script)
      .env("NODE_PATH", node_root.join("node_modules"))
      .env("URL_B", &url_b)
      .env("SYNC_COOKIE", &cookie)
      .env("WORKSPACE_ID", &workspace_id)
      .stdin(Stdio::piped())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .spawn()
      .expect("spawn wire test node");

    let mut stdout_reader = tokio::io::BufReader::new(child.stdout.take().unwrap());
    let mut line = String::new();
    tokio::io::AsyncBufReadExt::read_line(&mut stdout_reader, &mut line)
      .await
      .expect("read READY");
    assert_eq!(line.trim(), "READY");

    // Inject exact frozen v0.27.5 sync.doc.updates.pushed twice (same id -> deduped!)
    let redis_client = redis::Client::open(redis.url()).unwrap();
    let mut redis_conn = redis_client.get_multiplexed_async_connection().await.unwrap();
    let v0275_msg = json!({
      "event": "sync.doc.updates.pushed",
      "id": "eb_v0275_dedup_test_1",
      "originChannel": "production",
      "originId": "v0275-foreign-instance",
      "payload": {
        "compressed": false,
        "docId": "cross-doc",
        "editor": user_id,
        "originChannel": "production",
        "spaceId": workspace_id,
        "spaceType": "workspace",
        "timestamp": 1795384409999_i64,
        "updates": [GOLDEN_UPDATE_B64]
      },
      "requestId": "selfhosted:ws:v0275-test",
      "v": 1
    })
    .to_string();
    let _: () = redis_conn.publish(EVENTBUS_CHANNEL_V1, &v0275_msg).await.unwrap();
    let _: () = redis_conn.publish(EVENTBUS_CHANNEL_V1, &v0275_msg).await.unwrap();

    // Inject sync.permissions.changed to evict stale subscription.
    let perm_msg = json!({
      "event": "sync.permissions.changed",
      "id": "eb_v0275_perm_test_1",
      "originChannel": "production",
      "originId": "v0275-foreign-instance",
      "payload": {
        "spaceType": "workspace",
        "spaceId": workspace_id,
        "docId": "cross-doc"
      },
      "requestId": null,
      "v": 1
    })
    .to_string();
    let _: () = redis_conn.publish(EVENTBUS_CHANNEL_V1, &perm_msg).await.unwrap();

    // Give Redis pubsub -> Node B -> WS a short fence via Redis PING roundtrip + small yield.
    let _: String = redis::cmd("PING").query_async(&mut redis_conn).await.unwrap();
    tokio::time::sleep(Duration::from_millis(150)).await;

    {
      let stdin = child.stdin.as_mut().unwrap();
      stdin.write_all(b"CHECK\n").await.unwrap();
    }
    let mut result_line = String::new();
    tokio::io::AsyncBufReadExt::read_line(&mut stdout_reader, &mut result_line)
      .await
      .expect("read result");
    let status = child.wait().await.unwrap();
    assert!(status.success());

    let wire_out: Value = serde_json::from_str(result_line.trim()).expect("parse wire_out");
    // Deduplicated: only 1 broadcast received despite 2 identical Redis publishes!
    assert_eq!(wire_out["updates"].as_array().unwrap().len(), 1);
    assert_eq!(wire_out["updates"][0]["timestamp"], json!(1795384409999_i64));
    // Permission change emitted inventoryChanged invalidation and evicted subscription!
    assert!(
      wire_out["invalidations"]
        .as_array()
        .unwrap()
        .iter()
        .any(|v| v["inventoryChanged"] == json!(true))
    );
    assert_eq!(wire_out["loadAfterEvict"]["error"]["code"], json!("NOT_IN_SPACE"));

    handle_a.abort();
    handle_b.abort();
    node_a.shutdown().await;
    node_b.shutdown().await;
  });
}

#[test]
fn member_root_doc_write_lifecycle_physical_id_and_polling_reaper() {
  let cluster = PgCluster::from_env_or_docker().expect("PG16 test cluster");
  let redis = TestRedis::from_env_or_docker().expect("Redis 7 test instance");
  let empty = EmptyDbGuard::create(&cluster, "sync_c");

  let rt = test_runtime();
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig::new(&empty.url))
      .await
      .expect("connect ServerDb");
    db.ensure_schema_ready().await.expect("ensure_schema_ready");

    let (_owner_id, _owner_session, workspace_id) = seed_user_and_workspace(&db).await;

    // Seed a regular active `member` (not owner/admin) to verify root doc write permission.
    let member_id = Uuid::new_v4().to_string();
    let member_session = Uuid::new_v4().to_string();
    sqlx::query(
      "INSERT INTO users(id, name, email, registered, disabled) VALUES ($1, 'Regular Member', $2, true, false)",
    )
    .bind(&member_id)
    .bind(format!("member-{}@affine.test", &member_id[..8]))
    .execute(db.pool())
    .await
    .expect("insert member user");
    sqlx::query("INSERT INTO multiple_users_sessions(id) VALUES ($1)")
      .bind(&member_session)
      .execute(db.pool())
      .await
      .expect("insert member multiple_users_sessions");
    sqlx::query(
      "INSERT INTO user_sessions(id, session_id, user_id, expires_at) \
       VALUES ($1, $2, $3, now() + interval '15 days')",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&member_session)
    .bind(&member_id)
    .execute(db.pool())
    .await
    .expect("insert member user_sessions");
    sqlx::query(
      "INSERT INTO workspace_members(id, workspace_id, user_id, role, source, state) \
       VALUES ($1, $2, $3, 'member', 'legacy', 'active')",
    )
    .bind(format!("perm_{}", Uuid::new_v4().simple()))
    .bind(&workspace_id)
    .bind(&member_id)
    .execute(db.pool())
    .await
    .expect("insert workspace member with role='member'");

    let (server, base_url, http_handle) = spawn_sync_server(db.clone(), redis.url()).await;

    let script = r#"
const { io } = require('socket.io-client');

const url = process.env.SYNC_URL;
const cookie = process.env.SYNC_COOKIE;
const workspaceId = process.env.WORKSPACE_ID;
const updateB64 = process.env.GOLDEN_UPDATE;

function emitAck(socket, eventName, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ack for ${eventName}`)), 10000);
    socket.emit(eventName, payload, res => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

(async () => {
  const s = await new Promise((resolve, reject) => {
    const sock = io(url, {
      path: '/socket.io/',
      transports: ['websocket'],
      extraHeaders: { Cookie: cookie },
    });
    const timer = setTimeout(() => reject(new Error('connect timeout')), 10000);
    sock.on('connect', () => { clearTimeout(timer); resolve(sock); });
    sock.on('connect_error', err => { clearTimeout(timer); reject(err); });
  });

  // 1. Regular `member` joins workspace root doc and pushes a root doc update.
  const joinRoot = await emitAck(s, 'space:join-batch', {
    spaces: [{ spaceType: 'workspace', spaceId: workspaceId, docId: workspaceId }],
    clientVersion: '0.27.5',
    protocolVersion: 2,
  });
  const pushRoot = await emitAck(s, 'space:push-doc-update', {
    spaceType: 'workspace',
    spaceId: workspaceId,
    docId: workspaceId,
    update: updateB64,
    intent: 'update',
  });

  // 2. Create two ordinary docs and verify `space:doc-lifecycle` physicalDocId semantics.
  await emitAck(s, 'space:push-doc-update', {
    spaceType: 'workspace',
    spaceId: workspaceId,
    docId: 'logical-doc-b',
    update: updateB64,
    intent: 'create',
  });
  await emitAck(s, 'space:push-doc-update', {
    spaceType: 'workspace',
    spaceId: workspaceId,
    docId: 'physical-doc-a',
    update: updateB64,
    intent: 'create',
  });

  const trashWithPhysical = await emitAck(s, 'space:doc-lifecycle', {
    spaceType: 'workspace',
    spaceId: workspaceId,
    docId: 'logical-doc-b',
    physicalDocId: 'physical-doc-a',
    lifecycle: 'trash',
  });

  const deleteBoth = await emitAck(s, 'space:doc-lifecycle', {
    spaceType: 'workspace',
    spaceId: workspaceId,
    docId: 'logical-doc-b',
    physicalDocId: 'physical-doc-a',
    lifecycle: 'delete',
  });

  // 3. Open a raw polling handshake without upgrading to test zombie polling reaper.
  const openRes = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, {
    headers: { Cookie: cookie },
  });
  const openBody = await openRes.text();
  const openJson = JSON.parse(openBody.slice(1));

  s.disconnect();
  console.log(JSON.stringify({
    joinRoot,
    pushRoot,
    trashWithPhysical,
    deleteBoth,
    zombieSid: openJson.sid,
  }));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
"#;

    let cookie = format!("affine_session={member_session}; affine_user_id={member_id}");
    let out = run_node_socketio_script(
      script,
      &[
        ("SYNC_URL", &base_url),
        ("SYNC_COOKIE", &cookie),
        ("WORKSPACE_ID", &workspace_id),
        ("GOLDEN_UPDATE", GOLDEN_UPDATE_B64),
      ],
    )
    .await;

    // 1. Regular `member` successfully wrote the workspace root document.
    assert_eq!(out["joinRoot"]["data"]["success"], json!(true));
    assert_eq!(out["pushRoot"]["data"]["accepted"], json!(true));
    let root_updates: i64 =
      sqlx::query_scalar("SELECT count(*) FROM updates WHERE workspace_id = $1 AND guid = $1")
        .bind(&workspace_id)
        .fetch_one(db.pool())
        .await
        .unwrap();
    assert_eq!(root_updates, 1);

    // 2. Non-delete lifecycle with physicalDocId rejected; delete deletes both & tombstones both.
    assert_eq!(out["trashWithPhysical"]["error"]["code"], json!("BAD_REQUEST"));
    assert_eq!(
      out["trashWithPhysical"]["error"]["message"],
      json!("logical document identity is only valid for deletion")
    );
    assert_eq!(
      out["deleteBoth"]["data"]["deletedDocIds"],
      json!(["logical-doc-b", "physical-doc-a"])
    );
    let remaining_updates: i64 = sqlx::query_scalar(
      "SELECT count(*) FROM updates WHERE workspace_id = $1 AND guid = ANY($2)",
    )
    .bind(&workspace_id)
    .bind(vec!["logical-doc-b", "physical-doc-a"])
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(remaining_updates, 0);
    let tombstones: Vec<String> = sqlx::query_scalar(
      "SELECT page_id FROM workspace_pages WHERE workspace_id = $1 AND lifecycle_state = 'deleted' ORDER BY page_id ASC",
    )
    .bind(&workspace_id)
    .fetch_all(db.pool())
    .await
    .unwrap();
    assert_eq!(tombstones, vec!["logical-doc-b", "physical-doc-a"]);

    // 3. Reaping stale un-upgraded polling session removes it cleanly.
    let reaped = server.engine().reap_stale_polling_sessions(0).await;
    assert_eq!(reaped, 1);
    let zombie_sid = out["zombieSid"].as_str().expect("zombie sid");
    let check_script = r#"
(async () => {
  const res = await fetch(`${process.env.SYNC_URL}/socket.io/?EIO=4&transport=polling&sid=${process.env.ZOMBIE_SID}`);
  console.log(JSON.stringify({ status: res.status }));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
"#;
    let check_out = run_node_socketio_script(
      check_script,
      &[("SYNC_URL", &base_url), ("ZOMBIE_SID", zombie_sid)],
    )
    .await;
    assert_eq!(check_out["status"], json!(400));

    http_handle.abort();
    server.shutdown().await;
  });
}

#[test]
fn workspace_state_tenant_isolation_and_deleted_tombstones_hidden() {
  let cluster = PgCluster::from_env_or_docker().expect("PG16 test cluster");
  let redis = TestRedis::from_env_or_docker().expect("Redis 7 test instance");
  let empty = EmptyDbGuard::create(&cluster, "sync_iso");

  let rt = test_runtime();
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig::new(&empty.url))
      .await
      .expect("connect ServerDb");
    db.ensure_schema_ready().await.expect("ensure_schema_ready");

    let (user_a, session_a, ws_a) = seed_user_and_workspace(&db).await;
    let (_user_b, _session_b, ws_b) = seed_user_and_workspace(&db).await;

    // Seed Workspace A: 1 live doc, 1 trashed doc, 1 deleted tombstone.
    let storage = server_sync::storage::SyncStorage::new(db.clone());
    let golden = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, GOLDEN_UPDATE_B64).unwrap();
    storage
      .push_doc_update(
        server_sync::protocol::SpaceType::Workspace,
        &ws_a,
        "ws-a-live",
        &golden,
        &user_a,
        server_sync::protocol::PushDocIntent::Create,
        None,
        None,
      )
      .await
      .unwrap();
    storage
      .push_doc_update(
        server_sync::protocol::SpaceType::Workspace,
        &ws_a,
        "ws-a-trashed",
        &golden,
        &user_a,
        server_sync::protocol::PushDocIntent::Create,
        None,
        None,
      )
      .await
      .unwrap();
    storage
      .apply_doc_lifecycle(
        &ws_a,
        "ws-a-trashed",
        None,
        &user_a,
        server_sync::protocol::DocLifecycleAction::Trash,
      )
      .await
      .unwrap();
    storage
      .push_doc_update(
        server_sync::protocol::SpaceType::Workspace,
        &ws_a,
        "ws-a-deleted",
        &golden,
        &user_a,
        server_sync::protocol::PushDocIntent::Create,
        None,
        None,
      )
      .await
      .unwrap();
    storage
      .apply_doc_lifecycle(
        &ws_a,
        "ws-a-deleted",
        None,
        &user_a,
        server_sync::protocol::DocLifecycleAction::Delete,
      )
      .await
      .unwrap();

    // Seed Workspace B: trashed and deleted rows in workspace_pages that MUST NOT leak to Workspace A!
    sqlx::query(
      "INSERT INTO workspace_pages(workspace_id, page_id, lifecycle_state, lifecycle_changed_at) \
       VALUES ($1, 'ws-b-secret-trashed', 'trashed', clock_timestamp()), \
              ($1, 'ws-b-secret-deleted', 'deleted', clock_timestamp())",
    )
    .bind(&ws_b)
    .execute(db.pool())
    .await
    .unwrap();

    let (server, base_url, http_handle) = spawn_sync_server(db.clone(), redis.url()).await;

    let script = r#"
const { io } = require('socket.io-client');
const emitAck = (s, e, p) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`timeout ${e}`)), 10000);
  s.emit(e, p, r => { clearTimeout(t); res(r); });
});
(async () => {
  const s = await new Promise((res, rej) => {
    const sock = io(process.env.SYNC_URL, {
      path: '/socket.io/',
      transports: ['websocket'],
      extraHeaders: { Cookie: process.env.SYNC_COOKIE },
    });
    sock.on('connect', () => res(sock));
    sock.on('connect_error', rej);
  });
  await emitAck(s, 'space:join-batch', {
    spaces: [{ spaceType: 'workspace', spaceId: process.env.WS_A }],
    clientVersion: '0.27.5',
    protocolVersion: 2,
  });
  const state = await emitAck(s, 'space:load-workspace-state', {
    spaceType: 'workspace',
    spaceId: process.env.WS_A,
  });
  const timestamps = await emitAck(s, 'space:load-doc-timestamps', {
    spaceType: 'workspace',
    spaceId: process.env.WS_A,
  });
  s.disconnect();
  console.log(JSON.stringify({ state, timestamps }));
})().catch(e => { console.error(e); process.exit(1); });
"#;

    let cookie = format!("affine_session={session_a}; affine_user_id={user_a}");
    let out = run_node_socketio_script(
      script,
      &[("SYNC_URL", &base_url), ("SYNC_COOKIE", &cookie), ("WS_A", &ws_a)],
    )
    .await;

    let doc_ids: Vec<&str> = out["state"]["data"]["docs"]
      .as_array()
      .unwrap()
      .iter()
      .map(|d| d["docId"].as_str().unwrap())
      .collect();
    assert_eq!(doc_ids, vec!["ws-a-live", "ws-a-trashed"]);

    let ts_keys: Vec<&String> = out["timestamps"]["data"].as_object().unwrap().keys().collect();
    assert_eq!(ts_keys, vec!["ws-a-live", "ws-a-trashed"]);

    http_handle.abort();
    server.shutdown().await;
  });
}

#[test]
fn public_workspace_sync_denied_editor_lifecycle_denied_and_quota_readonly() {
  struct ReadonlyQuotaGate;
  #[async_trait::async_trait]
  impl server_spi::QuotaGate for ReadonlyQuotaGate {
    async fn resolve_workspace_grant(
      &self,
      _tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
      _workspace_id: &str,
      _now: chrono::DateTime<chrono::Utc>,
    ) -> Result<server_types::AccessGrant, server_types::DomainError> {
      let mut grant = server_types::license::default_selfhost_access_grant();
      grant.limits.seat_limit = 0;
      Ok(grant)
    }

    async fn check_seat_admission(
      &self,
      _tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
      _workspace_id: &str,
      _current_active_seats: i32,
      _adding_seats: i32,
      _now: chrono::DateTime<chrono::Utc>,
    ) -> Result<server_types::AccessGrant, server_types::DomainError> {
      Err(server_types::DomainError::QuotaExceeded {
        kind: "seat_limit",
        message: "readonly".into(),
      })
    }
  }

  let cluster = PgCluster::from_env_or_docker().expect("PG16 test cluster");
  let redis = TestRedis::from_env_or_docker().expect("Redis 7 test instance");
  let empty = EmptyDbGuard::create(&cluster, "sync_perm");

  let rt = test_runtime();
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig::new(&empty.url))
      .await
      .expect("connect ServerDb");
    db.ensure_schema_ready().await.expect("ensure_schema_ready");

    let (owner_id, _owner_session, ws_id) = seed_user_and_workspace(&db).await;
    // Mark workspace public & default member doc role to `editor`.
    sqlx::query(
      "UPDATE workspace_access_policies SET visibility = 'public', member_default_doc_role = 'editor' \
       WHERE workspace_id = $1",
    )
    .bind(&ws_id)
    .execute(db.pool())
    .await
    .unwrap();

    // Create an ordinary doc owned by owner_id.
    let storage = server_sync::storage::SyncStorage::new(db.clone());
    let golden = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, GOLDEN_UPDATE_B64).unwrap();
    storage
      .push_doc_update(
        server_sync::protocol::SpaceType::Workspace,
        &ws_id,
        "editor-test-doc",
        &golden,
        &owner_id,
        server_sync::protocol::PushDocIntent::Create,
        None,
        None,
      )
      .await
      .unwrap();

    // Seed outsider (non-member) and active member (editor via default role).
    let outsider_id = Uuid::new_v4().to_string();
    let outsider_session = Uuid::new_v4().to_string();
    let editor_id = Uuid::new_v4().to_string();
    let editor_session = Uuid::new_v4().to_string();
    for (uid, sid, email) in [
      (&outsider_id, &outsider_session, "outsider@affine.test"),
      (&editor_id, &editor_session, "editor@affine.test"),
    ] {
      sqlx::query("INSERT INTO users(id, name, email, registered, disabled) VALUES ($1, $1, $2, true, false)")
        .bind(uid)
        .bind(email)
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query("INSERT INTO multiple_users_sessions(id) VALUES ($1)")
        .bind(sid)
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query(
        "INSERT INTO user_sessions(id, session_id, user_id, expires_at) VALUES ($1, $2, $3, now() + interval '15 days')",
      )
      .bind(Uuid::new_v4().to_string())
      .bind(sid)
      .bind(uid)
      .execute(db.pool())
      .await
      .unwrap();
    }
    sqlx::query(
      "INSERT INTO workspace_members(id, workspace_id, user_id, role, source, state) \
       VALUES ($1, $2, $3, 'member', 'legacy', 'active')",
    )
    .bind(format!("perm_{}", Uuid::new_v4().simple()))
    .bind(&ws_id)
    .bind(&editor_id)
    .execute(db.pool())
    .await
    .unwrap();

    let (server, base_url, http_handle) = spawn_sync_server(db.clone(), redis.url()).await;

    let script = r#"
const { io } = require('socket.io-client');
const emitAck = (s, e, p) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`timeout ${e}`)), 10000);
  s.emit(e, p, r => { clearTimeout(t); res(r); });
});
const connect = cookie => new Promise((res, rej) => {
  const sock = io(process.env.SYNC_URL, {
    path: '/socket.io/',
    transports: ['websocket'],
    extraHeaders: { Cookie: cookie },
  });
  sock.on('connect', () => res(sock));
  sock.on('connect_error', rej);
});
(async () => {
  const outsider = await connect(process.env.OUTSIDER_COOKIE);
  const outsiderJoin = await emitAck(outsider, 'space:join-batch', {
    spaces: [{ spaceType: 'workspace', spaceId: process.env.WS_ID }],
    clientVersion: '0.27.5',
    protocolVersion: 2,
  });
  outsider.disconnect();

  const editor = await connect(process.env.EDITOR_COOKIE);
  const editorJoin = await emitAck(editor, 'space:join-batch', {
    spaces: [{ spaceType: 'workspace', spaceId: process.env.WS_ID, docId: 'editor-test-doc' }],
    clientVersion: '0.27.5',
    protocolVersion: 2,
  });
  const editorTrash = await emitAck(editor, 'space:doc-lifecycle', {
    spaceType: 'workspace',
    spaceId: process.env.WS_ID,
    docId: 'editor-test-doc',
    lifecycle: 'trash',
  });
  editor.disconnect();

  console.log(JSON.stringify({ outsiderJoin, editorJoin, editorTrash }));
})().catch(e => { console.error(e); process.exit(1); });
"#;

    let out = run_node_socketio_script(
      script,
      &[
        ("SYNC_URL", &base_url),
        ("WS_ID", &ws_id),
        (
          "OUTSIDER_COOKIE",
          &format!("affine_session={outsider_session}; affine_user_id={outsider_id}"),
        ),
        (
          "EDITOR_COOKIE",
          &format!("affine_session={editor_session}; affine_user_id={editor_id}"),
        ),
      ],
    )
    .await;

    // Non-member cannot join public workspace for sync.
    assert_eq!(out["outsiderJoin"]["error"]["code"], json!("SPACE_ACCESS_DENIED"));
    // Editor can join, but CANNOT trash/restore!
    assert_eq!(out["editorJoin"]["data"]["success"], json!(true));
    assert_eq!(out["editorTrash"]["error"]["code"], json!("DOC_ACTION_DENIED"));

    // Verify readonly QuotaGate blocks writes inside the transaction.
    let readonly_storage =
      server_sync::storage::SyncStorage::with_quota_gate(db.clone(), std::sync::Arc::new(ReadonlyQuotaGate));
    let err = readonly_storage
      .push_doc_update(
        server_sync::protocol::SpaceType::Workspace,
        &ws_id,
        "blocked-by-quota",
        &golden,
        &owner_id,
        server_sync::protocol::PushDocIntent::Create,
        None,
        None,
      )
      .await
      .unwrap_err();
    assert!(matches!(err, server_sync::error::SyncError::QuotaExceeded(_)));

    http_handle.abort();
    server.shutdown().await;
  });
}

#[test]
fn concurrent_doc_creation_no_deadlock_and_userspace_first_write_no_lost_update() {
  let cluster = PgCluster::from_env_or_docker().expect("PG16 test cluster");
  let empty = EmptyDbGuard::create(&cluster, "sync_conc");

  let rt = test_runtime();
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig::new(&empty.url))
      .await
      .expect("connect ServerDb");
    db.ensure_schema_ready().await.expect("ensure_schema_ready");

    let (user_id, _session_id, ws_id) = seed_user_and_workspace(&db).await;
    let storage = server_sync::storage::SyncStorage::new(db.clone());
    let golden = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, GOLDEN_UPDATE_B64).unwrap();

    // 1. 8 concurrent creates of distinct docs in the same workspace must NOT deadlock (40P01).
    let mut handles = Vec::new();
    for i in 0..8 {
      let s = storage.clone();
      let ws = ws_id.clone();
      let uid = user_id.clone();
      let upd = golden.clone();
      handles.push(tokio::spawn(async move {
        s.push_doc_update(
          server_sync::protocol::SpaceType::Workspace,
          &ws,
          &format!("conc-doc-{i}"),
          &upd,
          &uid,
          server_sync::protocol::PushDocIntent::Create,
          None,
          None,
        )
        .await
      }));
    }
    for h in handles {
      let res = h.await.unwrap().expect("concurrent doc create must not deadlock");
      assert!(res.created);
    }

    // 2. Concurrent first-writes to the same userspace doc must merge both updates without lost update.
    let doc1 = y_octo::Doc::with_client(101);
    doc1
      .get_or_create_map("m")
      .unwrap()
      .insert("k1".to_owned(), "v1".to_owned())
      .unwrap();
    let u1 = doc1.encode_update_v1().unwrap();

    let doc2 = y_octo::Doc::with_client(202);
    doc2
      .get_or_create_map("m")
      .unwrap()
      .insert("k2".to_owned(), "v2".to_owned())
      .unwrap();
    let u2 = doc2.encode_update_v1().unwrap();

    let (r1, r2) = tokio::join!(
      storage.push_doc_update(
        server_sync::protocol::SpaceType::Userspace,
        &user_id,
        "us-race-doc",
        &u1,
        &user_id,
        server_sync::protocol::PushDocIntent::Create,
        None,
        None,
      ),
      storage.push_doc_update(
        server_sync::protocol::SpaceType::Userspace,
        &user_id,
        "us-race-doc",
        &u2,
        &user_id,
        server_sync::protocol::PushDocIntent::Create,
        None,
        None,
      )
    );
    r1.expect("userspace write 1");
    r2.expect("userspace write 2");

    let diff = storage
      .load_doc_diff(
        server_sync::protocol::SpaceType::Userspace,
        &user_id,
        "us-race-doc",
        None,
      )
      .await
      .unwrap()
      .expect("userspace doc exists");
    let merged = y_octo::Doc::try_from_binary_v1(&diff.missing).unwrap();
    let map = merged.get_map("m").unwrap();
    assert!(map.get("k1").is_some(), "k1 must be preserved");
    assert!(map.get("k2").is_some(), "k2 must be preserved");
  });
}

#[test]
fn ensure_workspace_lifecycle_migrates_legacy_root_meta_pages() {
  let cluster = PgCluster::from_env_or_docker().expect("PG16 test cluster");
  let empty = EmptyDbGuard::create(&cluster, "sync_mig");

  let rt = test_runtime();
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig::new(&empty.url))
      .await
      .expect("connect ServerDb");
    db.ensure_schema_ready().await.expect("ensure_schema_ready");

    let (user_id, _session_id, ws_id) = seed_user_and_workspace(&db).await;

    // Build a legacy workspace root doc containing 1 live page + 1 trashed page in meta.pages.
    let root = y_octo::Doc::new();
    let mut meta = root.get_or_create_map("meta").unwrap();
    let mut pages = root.create_array().unwrap();
    let mut live_page = y_octo::AHashMap::new();
    live_page.insert("id".to_owned(), y_octo::Any::String("legacy-live-page".to_owned()));
    pages.push(y_octo::Any::Object(Box::new(live_page))).unwrap();
    let mut trashed_page = y_octo::AHashMap::new();
    trashed_page.insert("id".to_owned(), y_octo::Any::String("legacy-trashed-page".to_owned()));
    trashed_page.insert("trash".to_owned(), y_octo::Any::True);
    pages.push(y_octo::Any::Object(Box::new(trashed_page))).unwrap();
    meta.insert("pages".to_owned(), pages).unwrap();
    let root_bin = root.encode_update_v1().unwrap();

    sqlx::query(
      "INSERT INTO updates(workspace_id, guid, blob, created_at, created_by) \
       VALUES ($1, $1, $2, date_trunc('milliseconds', clock_timestamp()), $3)",
    )
    .bind(&ws_id)
    .bind(&root_bin)
    .bind(&user_id)
    .execute(db.pool())
    .await
    .unwrap();

    let storage = server_sync::storage::SyncStorage::new(db.clone());
    storage.ensure_workspace_lifecycle(&ws_id, 2).await.unwrap();

    // Both pages must be retained in `updates`.
    let retained: Vec<String> = sqlx::query_scalar(
      "SELECT guid FROM updates WHERE workspace_id = $1 AND guid IN ('legacy-live-page', 'legacy-trashed-page') ORDER BY guid ASC",
    )
    .bind(&ws_id)
    .fetch_all(db.pool())
    .await
    .unwrap();
    assert_eq!(retained, vec!["legacy-live-page", "legacy-trashed-page"]);

    // Trashed page must be migrated to `workspace_pages` with lifecycle_state = 'trashed'.
    let trashed_state: String = sqlx::query_scalar(
      "SELECT lifecycle_state::text FROM workspace_pages WHERE workspace_id = $1 AND page_id = 'legacy-trashed-page'",
    )
    .bind(&ws_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(trashed_state, "trashed");

    let meta_json: Value = sqlx::query_scalar(
      "SELECT metadata FROM storage_reconciliation_checkpoints WHERE kind = 'workspace_doc_lifecycle' AND scope = $1 AND status = 'completed'",
    )
    .bind(&ws_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(meta_json["rootStatus"], json!("decoded"));
  });
}

#[test]
fn ws_probe_abort_preserves_polling_and_reject_join_flushes_ack() {
  let cluster = PgCluster::from_env_or_docker().expect("PG16 test cluster");
  let redis = TestRedis::from_env_or_docker().expect("Redis 7 test instance");
  let empty = EmptyDbGuard::create(&cluster, "sync_eio");

  let rt = test_runtime();
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig::new(&empty.url))
      .await
      .expect("connect ServerDb");
    db.ensure_schema_ready().await.expect("ensure_schema_ready");

    let (user_id, session_id, ws_id) = seed_user_and_workspace(&db).await;
    let (server, base_url, http_handle) = spawn_sync_server(db.clone(), redis.url()).await;

    let script = r#"
const { io } = require('socket.io-client');

const url = process.env.SYNC_URL;
const wsUrl = url.replace(/^http/, 'ws');
const cookie = process.env.SYNC_COOKIE;
const wsId = process.env.WS_ID;

(async () => {
  // 1. Open HTTP polling session, connect Socket.IO (`40`), open WS probe (`2probe` -> `3probe`),
  //    then abort WS WITHOUT sending `5`, and verify polling session is STILL alive!
  const openRes = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, {
    headers: { Cookie: cookie },
  });
  const openPacket = await openRes.text();
  const sid = JSON.parse(openPacket.slice(1)).sid;

  await fetch(`${url}/socket.io/?EIO=4&transport=polling&sid=${sid}`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'text/plain' },
    body: '40',
  });
  const connectPoll = await (await fetch(`${url}/socket.io/?EIO=4&transport=polling&sid=${sid}`, {
    headers: { Cookie: cookie },
  })).text();

  // Open raw WebSocket upgrade probe, receive `3probe`, then close BEFORE `5`!
  const probeReply = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsUrl}/socket.io/?EIO=4&transport=websocket&sid=${sid}`);
    const timer = setTimeout(() => reject(new Error('probe timeout')), 5000);
    ws.addEventListener('open', () => ws.send('2probe'));
    ws.addEventListener('message', ev => {
      clearTimeout(timer);
      const data = String(ev.data);
      ws.close();
      resolve(data);
    });
    ws.addEventListener('error', err => { clearTimeout(timer); reject(err); });
  });

  // Drain the noop (`6`) woken by `2probe` and then send a real `space:join-batch` over polling!
  await fetch(`${url}/socket.io/?EIO=4&transport=polling&sid=${sid}`, { headers: { Cookie: cookie } });

  const joinPayload = JSON.stringify(['space:join-batch', {
    spaces: [{ spaceType: 'workspace', spaceId: wsId }],
    clientVersion: '0.27.5',
    protocolVersion: 2,
  }]);
  const postAfterAbort = await fetch(`${url}/socket.io/?EIO=4&transport=polling&sid=${sid}`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'text/plain' },
    body: `427${joinPayload}`,
  });
  const joinPollText = await (await fetch(`${url}/socket.io/?EIO=4&transport=polling&sid=${sid}`, {
    headers: { Cookie: cookie },
  })).text();

  // 2. Reject-join (old clientVersion) must deliver reject ACK BEFORE disconnect!
  const rejectResult = await new Promise((resolve, reject) => {
    const sock = io(url, {
      path: '/socket.io/',
      transports: ['websocket'],
      extraHeaders: { Cookie: cookie },
    });
    let ackVal = null;
    const timer = setTimeout(() => reject(new Error('reject-join timeout')), 10000);
    sock.on('connect', () => {
      sock.emit('space:join-batch', {
        spaces: [{ spaceType: 'workspace', spaceId: wsId }],
        clientVersion: '0.27.4',
        protocolVersion: 2,
      }, res => {
        ackVal = res;
      });
    });
    sock.on('disconnect', reason => {
      clearTimeout(timer);
      resolve({ ackVal, reason });
    });
    sock.on('connect_error', err => { clearTimeout(timer); reject(err); });
  });

  console.log(JSON.stringify({
    connectPollStarts40: connectPoll.startsWith('40'),
    probeReply,
    postAfterAbortStatus: postAfterAbort.status,
    joinPollText,
    rejectResult,
  }));
})().catch(e => { console.error(e); process.exit(1); });
"#;

    let cookie = format!("affine_session={session_id}; affine_user_id={user_id}");
    let out = run_node_socketio_script(
      script,
      &[("SYNC_URL", &base_url), ("SYNC_COOKIE", &cookie), ("WS_ID", &ws_id)],
    )
    .await;

    assert_eq!(out["connectPollStarts40"], json!(true));
    assert_eq!(out["probeReply"], json!("3probe"));
    assert_eq!(out["postAfterAbortStatus"], json!(200));
    assert!(
      out["joinPollText"].as_str().unwrap().contains(r#""success":true"#),
      "polling session must survive aborted WS probe: {:?}",
      out["joinPollText"]
    );
    assert_eq!(out["rejectResult"]["ackVal"]["data"]["success"], json!(false));

    http_handle.abort();
    server.shutdown().await;
  });
}

#[test]
fn removed_member_in_public_workspace_evicted_from_rooms_and_broadcasts() {
  let cluster = PgCluster::from_env_or_docker().expect("PG16 test cluster");
  let redis = TestRedis::from_env_or_docker().expect("Redis 7 test instance");
  let empty = EmptyDbGuard::create(&cluster, "sync_kick");

  let rt = test_runtime();
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig::new(&empty.url))
      .await
      .expect("connect ServerDb");
    db.ensure_schema_ready().await.expect("ensure_schema_ready");

    let (owner_id, _owner_session, ws_id) = seed_user_and_workspace(&db).await;

    // Make workspace public AND publish a public doc (both doc_access_policies & workspace_pages published_at IS NOT NULL).
    sqlx::query("UPDATE workspace_access_policies SET visibility = 'public', member_default_doc_role = 'reader' WHERE workspace_id = $1")
      .bind(&ws_id)
      .execute(db.pool())
      .await
      .unwrap();

    let storage = server_sync::storage::SyncStorage::new(db.clone());
    let golden = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, GOLDEN_UPDATE_B64).unwrap();
    storage
      .push_doc_update(
        server_sync::protocol::SpaceType::Workspace,
        &ws_id,
        "pub-doc",
        &golden,
        &owner_id,
        server_sync::protocol::PushDocIntent::Create,
        None,
        None,
      )
      .await
      .unwrap();

    sqlx::query(
      "INSERT INTO doc_access_policies(workspace_id, doc_id, visibility, public_role, published_at) \
       VALUES ($1, 'pub-doc', 'public', 'external', now()) \
       ON CONFLICT (workspace_id, doc_id) DO UPDATE SET visibility = 'public', public_role = 'external', published_at = now()",
    )
    .bind(&ws_id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO workspace_pages(workspace_id, page_id, published_at) \
       VALUES ($1, 'pub-doc', now()) \
       ON CONFLICT (workspace_id, page_id) DO UPDATE SET published_at = now()",
    )
    .bind(&ws_id)
    .execute(db.pool())
    .await
    .unwrap();

    // Seed an active member who will later be removed.
    let member_id = Uuid::new_v4().to_string();
    let member_session = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO users(id, name, email, registered, disabled) VALUES ($1, 'Kicked', $2, true, false)")
      .bind(&member_id)
      .bind(format!("kicked-{}@affine.test", &member_id[..8]))
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query("INSERT INTO multiple_users_sessions(id) VALUES ($1)")
      .bind(&member_session)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO user_sessions(id, session_id, user_id, expires_at) VALUES ($1, $2, $3, now() + interval '15 days')",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&member_session)
    .bind(&member_id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO workspace_members(id, workspace_id, user_id, role, source, state) \
       VALUES ($1, $2, $3, 'member', 'legacy', 'active')",
    )
    .bind(format!("perm_{}", Uuid::new_v4().simple()))
    .bind(&ws_id)
    .bind(&member_id)
    .execute(db.pool())
    .await
    .unwrap();

    let (server, base_url, http_handle) = spawn_sync_server(db.clone(), redis.url()).await;

    let script = r#"
const { io } = require('socket.io-client');
const s = io(process.env.SYNC_URL, {
  path: '/socket.io/',
  transports: ['websocket'],
  extraHeaders: { Cookie: process.env.MEMBER_COOKIE },
});
const updates = [];
const invalidations = [];
s.on('space:broadcast-doc-updates', p => updates.push(p));
s.on('space:broadcast-doc-invalidation', p => invalidations.push(p));
s.on('connect', () => {
  s.emit('space:join-batch', {
    spaces: [{ spaceType: 'workspace', spaceId: process.env.WS_ID, docId: 'pub-doc' }],
    clientVersion: '0.27.5',
    protocolVersion: 2,
  }, ack => {
    if (!ack?.data?.success) process.exit(2);
    console.log('JOINED');
  });
});
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (chunk.includes('CHECK')) {
    s.emit('space:load-doc', {
      spaceType: 'workspace',
      spaceId: process.env.WS_ID,
      docId: 'pub-doc',
    }, loadRes => {
      console.log(JSON.stringify({ updates, invalidations, loadRes }));
      s.disconnect();
      process.exit(0);
    });
  }
});
"#;

    let member_cookie = format!("affine_session={member_session}; affine_user_id={member_id}");
    let node_root = locate_node_modules_root();
    let mut child = Command::new("node")
      .arg("--input-type=commonjs")
      .arg("-e")
      .arg(script)
      .env("NODE_PATH", node_root.join("node_modules"))
      .env("SYNC_URL", &base_url)
      .env("MEMBER_COOKIE", &member_cookie)
      .env("WS_ID", &ws_id)
      .stdin(Stdio::piped())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .spawn()
      .expect("spawn member node");

    let mut stdout_reader = tokio::io::BufReader::new(child.stdout.take().unwrap());
    let mut line = String::new();
    tokio::io::AsyncBufReadExt::read_line(&mut stdout_reader, &mut line)
      .await
      .unwrap();
    assert_eq!(line.trim(), "JOINED");

    // Remove member from workspace_members, then publish workspaceInventoryChanged.
    sqlx::query("DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2")
      .bind(&ws_id)
      .bind(&member_id)
      .execute(db.pool())
      .await
      .unwrap();

    let redis_client = redis::Client::open(redis.url()).unwrap();
    let mut redis_conn = redis_client.get_multiplexed_async_connection().await.unwrap();
    let inv = json!({
      "kind": "workspaceInventoryChanged",
      "workspaceId": ws_id,
      "docId": "pub-doc",
      "version": 1
    })
    .to_string();
    let _: () = redis_conn.publish(INVALIDATION_CHANNEL_V1, &inv).await.unwrap();
    let _: String = redis::cmd("PING").query_async(&mut redis_conn).await.unwrap();
    tokio::time::sleep(Duration::from_millis(200)).await;

    // Simulate another peer pushing an update to `pub-doc` after member removal.
    let foreign_push = json!({
      "event": "sync.doc.updates.pushed",
      "id": "eb_after_kick_1",
      "originChannel": "production",
      "originId": "peer-after-kick",
      "payload": {
        "compressed": false,
        "docId": "pub-doc",
        "editor": owner_id,
        "originChannel": "production",
        "spaceId": ws_id,
        "spaceType": "workspace",
        "timestamp": 1795389999000_i64,
        "updates": [GOLDEN_UPDATE_B64]
      },
      "requestId": null,
      "v": 1
    })
    .to_string();
    let _: () = redis_conn.publish(EVENTBUS_CHANNEL_V1, &foreign_push).await.unwrap();
    let _: String = redis::cmd("PING").query_async(&mut redis_conn).await.unwrap();
    tokio::time::sleep(Duration::from_millis(150)).await;

    child.stdin.as_mut().unwrap().write_all(b"CHECK\n").await.unwrap();
    let mut result_line = String::new();
    tokio::io::AsyncBufReadExt::read_line(&mut stdout_reader, &mut result_line)
      .await
      .unwrap();
    let status = child.wait().await.unwrap();
    assert!(status.success());

    let out: Value = serde_json::from_str(result_line.trim()).unwrap();
    // Kicked member must NOT receive any doc update broadcasts or invalidations,
    // and must be rejected as NOT_IN_SPACE (evicted from both rooms & doc subs).
    assert_eq!(out["updates"].as_array().unwrap().len(), 0);
    assert_eq!(out["invalidations"].as_array().unwrap().len(), 0);
    assert_eq!(out["loadRes"]["error"]["code"], json!("NOT_IN_SPACE"));

    http_handle.abort();
    server.shutdown().await;
  });
}

#[test]
fn reader_default_role_create_doc_reserved_write_lifecycle_gate_and_binary_event() {
  let cluster = PgCluster::from_env_or_docker().expect("PG16 test cluster");
  let redis = TestRedis::from_env_or_docker().expect("Redis 7 test instance");
  let empty = EmptyDbGuard::create(&cluster, "sync_r3");

  let rt = test_runtime();
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig::new(&empty.url))
      .await
      .expect("connect ServerDb");
    db.ensure_schema_ready().await.expect("ensure_schema_ready");

    let (_owner_id, _owner_session, ws_id) = seed_user_and_workspace(&db).await;

    // 1. Verify global lifecycle activation gate: when absent, ensure_workspace_lifecycle(ws, 2)
    //    must fail with BadRequest("Workspace lifecycle not active.") without writing completed.
    sqlx::query("DELETE FROM storage_reconciliation_checkpoints WHERE kind = 'workspace_doc_lifecycle_activation'")
      .execute(db.pool())
      .await
      .unwrap();
    let storage = server_sync::storage::SyncStorage::new(db.clone());
    let inactive_err = storage.ensure_workspace_lifecycle(&ws_id, 2).await.unwrap_err();
    assert!(matches!(inactive_err, server_sync::error::SyncError::BadRequest(_)));
    let completed_count: i64 = sqlx::query_scalar(
      "SELECT count(*) FROM storage_reconciliation_checkpoints WHERE kind = 'workspace_doc_lifecycle' AND scope = $1",
    )
    .bind(&ws_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(completed_count, 0);

    // Re-activate global lifecycle.
    sqlx::query(
      "INSERT INTO storage_reconciliation_checkpoints(kind, scope, status, cursor, metadata, completed_at, updated_at) \
       VALUES ('workspace_doc_lifecycle_activation', 'global', 'active', '{}'::jsonb, '{\"protocolVersion\":2}'::jsonb, clock_timestamp(), clock_timestamp())",
    )
    .execute(db.pool())
    .await
    .unwrap();

    // 2. Configure `member_default_doc_role = 'reader'` and add an active `member`.
    sqlx::query("UPDATE workspace_access_policies SET member_default_doc_role = 'reader' WHERE workspace_id = $1")
      .bind(&ws_id)
      .execute(db.pool())
      .await
      .unwrap();

    let member_id = Uuid::new_v4().to_string();
    let member_session = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO users(id, name, email, registered, disabled) VALUES ($1, 'ReaderMember', $2, true, false)")
      .bind(&member_id)
      .bind(format!("reader-{}@affine.test", &member_id[..8]))
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query("INSERT INTO multiple_users_sessions(id) VALUES ($1)")
      .bind(&member_session)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO user_sessions(id, session_id, user_id, expires_at) VALUES ($1, $2, $3, now() + interval '15 days')",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&member_session)
    .bind(&member_id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO workspace_members(id, workspace_id, user_id, role, source, state) \
       VALUES ($1, $2, $3, 'member', 'legacy', 'active')",
    )
    .bind(format!("perm_{}", Uuid::new_v4().simple()))
    .bind(&ws_id)
    .bind(&member_id)
    .execute(db.pool())
    .await
    .unwrap();

    let (server, base_url, http_handle) = spawn_sync_server(db.clone(), redis.url()).await;

    let script = r#"
const wsUrl = process.env.SYNC_URL.replace('http://', 'ws://') + '/socket.io/?EIO=4&transport=websocket';
const cookie = process.env.MEMBER_COOKIE;
const wsId = process.env.WS_ID;
const memberId = process.env.MEMBER_ID;
const goldenB64 = process.env.GOLDEN_UPDATE;
const goldenBuf = Buffer.from(goldenB64, 'base64');

const { io } = require('socket.io-client');

(async () => {
  // Part A: socket.io-client verifies reader member can join explorerIcon & docIntegrationRef,
  // is denied writing explorerIcon, and succeeds creating an ordinary doc via Workspace.CreateDoc.
  const sock = io(process.env.SYNC_URL, {
    path: '/socket.io/',
    transports: ['websocket'],
    extraHeaders: { Cookie: cookie },
  });
  await new Promise((resolve, reject) => {
    sock.on('connect', resolve);
    sock.on('connect_error', reject);
  });
  const emitAck = (ev, payload) => new Promise(resolve => sock.emit(ev, payload, resolve));
  const joinReserved = await emitAck('space:join-batch', {
    spaces: [
      { spaceType: 'workspace', spaceId: wsId, docId: `db$${wsId}$explorerIcon` },
      { spaceType: 'workspace', spaceId: wsId, docId: `userdata$${memberId}$${wsId}$docIntegrationRef` },
    ],
    clientVersion: '0.27.5',
    protocolVersion: 2,
  });
  const pushReservedDenied = await emitAck('space:push-doc-update', {
    spaceType: 'workspace',
    spaceId: wsId,
    docId: `db$${wsId}$explorerIcon`,
    update: goldenB64,
    intent: 'update',
  });
  const createOrdinaryOk = await emitAck('space:push-doc-update', {
    spaceType: 'workspace',
    spaceId: wsId,
    docId: 'reader-created-doc',
    update: goldenB64,
    intent: 'create',
  });
  sock.disconnect();

  // Part B: raw WebSocket verifies Socket.IO BINARY_EVENT (`451-<ack>[...,{"_placeholder":true,"num":0}]`)
  // + binary frame reassembly produces an accepted ACK.
  const ws = new WebSocket(wsUrl, { headers: { Cookie: cookie } });
  const nextMsg = (prefix = '') => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ws timeout waiting for ' + prefix)), 5000);
    const onMsg = e => {
      const s = String(e.data);
      if (!prefix || s.startsWith(prefix)) {
        clearTimeout(t);
        ws.removeEventListener('message', onMsg);
        resolve(s);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.addEventListener('error', e => { clearTimeout(t); reject(e); }, { once: true });
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  await nextMsg('0'); // EIO open `0{...}`
  ws.send('40');
  await nextMsg('40'); // SIO connect `40{...}`
  ws.send('421' + JSON.stringify(['space:join-batch', {
    spaces: [{ spaceType: 'workspace', spaceId: wsId }],
    clientVersion: '0.27.5',
    protocolVersion: 2,
  }]));
  await nextMsg('431'); // join ACK `431[...]`
  // Send BINARY_EVENT header with 1 placeholder + 1 binary WS frame.
  ws.send('451-2' + JSON.stringify(['space:push-doc-update', {
    spaceType: 'workspace',
    spaceId: wsId,
    docId: 'binary-event-doc',
    intent: 'create',
    update: { _placeholder: true, num: 0 },
  }]));
  ws.send(goldenBuf);
  const binaryAckRaw = await nextMsg('432');
  ws.close();

  console.log(JSON.stringify({
    joinReserved,
    pushReservedDenied,
    createOrdinaryOk,
    binaryAckRaw,
  }));
})().catch(e => { console.error(e); process.exit(1); });
"#;

    let member_cookie = format!("affine_session={member_session}; affine_user_id={member_id}");
    let out = run_node_socketio_script(
      script,
      &[
        ("SYNC_URL", &base_url),
        ("MEMBER_COOKIE", &member_cookie),
        ("WS_ID", &ws_id),
        ("MEMBER_ID", &member_id),
        ("GOLDEN_UPDATE", GOLDEN_UPDATE_B64),
      ],
    )
    .await;

    assert_eq!(out["joinReserved"]["data"]["success"], json!(true));
    assert_eq!(out["pushReservedDenied"]["error"]["code"], json!("DOC_ACTION_DENIED"));
    assert_eq!(out["createOrdinaryOk"]["data"]["accepted"], json!(true));
    assert!(
      out["binaryAckRaw"]
        .as_str()
        .unwrap()
        .contains(r#""accepted":true"#),
      "BINARY_EVENT must reassemble attachment and return accepted ACK: {:?}",
      out["binaryAckRaw"]
    );

    http_handle.abort();
    server.shutdown().await;
  });
}

#[test]
fn notify_enable_no_lost_wakeup_binary_guards_and_create_with_preexisting_bindings() {
  let cluster = PgCluster::from_env_or_docker().expect("PG16 test cluster");
  let redis = TestRedis::from_env_or_docker().expect("Redis 7 test instance");
  let empty = EmptyDbGuard::create(&cluster, "sync_r4");

  let rt = test_runtime();
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig::new(&empty.url))
      .await
      .expect("connect ServerDb");
    db.ensure_schema_ready().await.expect("ensure_schema_ready");

    let (owner_id, owner_session, ws_id) = seed_user_and_workspace(&db).await;

    // Seed an outsider (non-member) and an active member for testing `creating && has_bindings`.
    let outsider_id = Uuid::new_v4().to_string();
    let member_id = Uuid::new_v4().to_string();
    for (uid, email) in [(&outsider_id, "r4-outsider@affine.test"), (&member_id, "r4-member@affine.test")] {
      sqlx::query("INSERT INTO users(id, name, email, registered, disabled) VALUES ($1, 'R4', $2, true, false)")
        .bind(uid)
        .bind(email)
        .execute(db.pool())
        .await
        .unwrap();
    }
    sqlx::query(
      "INSERT INTO workspace_members(id, workspace_id, user_id, role, source, state) \
       VALUES ($1, $2, $3, 'member', 'legacy', 'active')",
    )
    .bind(format!("perm_{}", Uuid::new_v4().simple()))
    .bind(&ws_id)
    .bind(&member_id)
    .execute(db.pool())
    .await
    .unwrap();

    // Pre-insert `doc_grants(editor)` on an uncreated doc for BOTH outsider and active member.
    sqlx::query(
      "INSERT INTO doc_grants(workspace_id, doc_id, principal_type, principal_id, role, granted_by) \
       VALUES ($1, 'prebound-doc', 'user', $2, 'editor', $3), ($1, 'prebound-doc', 'user', $4, 'editor', $3)",
    )
    .bind(&ws_id)
    .bind(&outsider_id)
    .bind(&owner_id)
    .bind(&member_id)
    .execute(db.pool())
    .await
    .unwrap();

    let storage = server_sync::storage::SyncStorage::new(db.clone());
    let golden = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, GOLDEN_UPDATE_B64).unwrap();

    // 1a. Outsider (lacks WorkspaceAction::CreateDoc) MUST be denied even with pre-existing editor grant.
    let outsider_err = storage
      .push_doc_update(
        server_sync::protocol::SpaceType::Workspace,
        &ws_id,
        "prebound-doc",
        &golden,
        &outsider_id,
        server_sync::protocol::PushDocIntent::Create,
        None,
        None,
      )
      .await
      .unwrap_err();
    assert!(matches!(outsider_err, server_sync::error::SyncError::AccessDenied(_)));

    // 1b. Active member (has CreateDoc + pre-existing editor grant) succeeds WITHOUT inserting a duplicate owner grant.
    let member_ok = storage
      .push_doc_update(
        server_sync::protocol::SpaceType::Workspace,
        &ws_id,
        "prebound-doc",
        &golden,
        &member_id,
        server_sync::protocol::PushDocIntent::Create,
        None,
        None,
      )
      .await
      .expect("active member with pre-existing editor grant must create doc");
    assert!(member_ok.created);
    let owner_grants: i64 = sqlx::query_scalar(
      "SELECT count(*) FROM doc_grants WHERE workspace_id = $1 AND doc_id = 'prebound-doc' AND role = 'owner'",
    )
    .bind(&ws_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(owner_grants, 0);

    // 2. Start live server and verify:
    //    (a) Pre-enabled `Notified::enable()` wakes in < 50ms when `send_ack_and_maybe_close` fires before await.
    //    (b) 50 rapid consecutive Socket.IO ACK roundtrips finish in < 2s (no lost wakeup into 25s ping).
    //    (c) Unauthenticated WS `451-...` + binary frame leaves `pending_binary == None`.
    //    (d) Authenticated WS multi-frame BINARY_EVENT exceeding cumulative byte budget clears & closes session.
    let (server, base_url, http_handle) = spawn_sync_server(db.clone(), redis.url()).await;

    // 2a. Direct unit-level verification of `Notified::enable()` + `send_ack_and_maybe_close` on a real session.
    let open_json = run_node_socketio_script(
      "fetch(process.env.SYNC_URL + '/socket.io/?EIO=4&transport=polling').then(r => r.text()).then(t => console.log(t.slice(1)));",
      &[("SYNC_URL", &base_url)],
    )
    .await;
    let probe_sid = open_json["sid"].as_str().unwrap().to_owned();
    let probe_session = server.engine().get_by_engine_sid(&probe_sid).await.unwrap();
    {
      let notified = probe_session.notified();
      tokio::pin!(notified);
      notified.as_mut().enable();
      // Fire notification BEFORE awaiting `notified`.
      probe_session
        .send_ack_and_maybe_close(Some(99), &json!({"ok": true}), false)
        .await;
      let t0 = tokio::time::Instant::now();
      tokio::time::timeout(Duration::from_millis(50), &mut notified)
        .await
        .expect("pre-enabled Notified must wake immediately without lost wakeup");
      assert!(t0.elapsed() < Duration::from_millis(50));
    }

    // 2b. 50 rapid Socket.IO ACK roundtrips over WebSocket must complete in < 2s.
    let rapid_script = r#"
const { io } = require('socket.io-client');
const sock = io(process.env.SYNC_URL, {
  path: '/socket.io/',
  transports: ['websocket'],
  extraHeaders: { Cookie: process.env.OWNER_COOKIE },
});
(async () => {
  await new Promise((resolve, reject) => {
    sock.on('connect', resolve);
    sock.on('connect_error', reject);
  });
  const emitAck = (ev, payload) => new Promise(resolve => sock.emit(ev, payload, resolve));
  const joinAck = await emitAck('space:join-batch', {
    spaces: [{ spaceType: 'workspace', spaceId: process.env.WS_ID }],
    clientVersion: '0.27.5',
    protocolVersion: 2,
  });
  const t0 = Date.now();
  for (let i = 0; i < 50; i++) {
    const r = await emitAck('space:load-doc-timestamps', {
      spaceType: 'workspace',
      spaceId: process.env.WS_ID,
    });
    if (!r?.data) throw new Error('unexpected ack at ' + i + ': ' + JSON.stringify(r));
  }
  const elapsedMs = Date.now() - t0;
  sock.disconnect();
  console.log(JSON.stringify({ joinOk: joinAck?.data?.success === true, elapsedMs }));
})().catch(e => { console.error(e); process.exit(1); });
"#;

    let owner_cookie = format!("affine_session={owner_session}; affine_user_id={owner_id}");
    let rapid_out = run_node_socketio_script(
      rapid_script,
      &[
        ("SYNC_URL", &base_url),
        ("OWNER_COOKIE", &owner_cookie),
        ("WS_ID", &ws_id),
      ],
    )
    .await;
    assert_eq!(rapid_out["joinOk"], json!(true));
    let elapsed_ms = rapid_out["elapsedMs"].as_u64().unwrap();
    assert!(
      elapsed_ms < 2000,
      "50 rapid ACK roundtrips took {elapsed_ms}ms (must be < 2000ms)"
    );

    // 2c. Unauthenticated WS sending `451-...` + binary frame must NOT retain `pending_binary`.
    let unauth_script = r#"
const wsUrl = process.env.SYNC_URL.replace('http://', 'ws://') + '/socket.io/?EIO=4&transport=websocket';
(async () => {
  const ws = new WebSocket(wsUrl);
  const nextMsg = () => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), 3000);
    ws.addEventListener('message', e => { clearTimeout(t); resolve(String(e.data)); }, { once: true });
    ws.addEventListener('error', e => { clearTimeout(t); reject(e); }, { once: true });
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const openRaw = await nextMsg();
  const sid = JSON.parse(openRaw.slice(1)).sid;
  // Send BINARY_EVENT + 1 binary frame WITHOUT ever sending `40` connect/auth.
  ws.send('452-1' + JSON.stringify(['space:push-doc-update', {
    spaceType: 'workspace',
    spaceId: process.env.WS_ID,
    docId: 'unauth-bin-doc',
    intent: 'create',
    update: { _placeholder: true, num: 0 },
  }]));
  ws.send(Buffer.alloc(64, 0xab));
  console.log(sid);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', () => { ws.close(); process.exit(0); });
})().catch(e => { console.error(e); process.exit(1); });
"#;
    let node_root = locate_node_modules_root();
    let mut unauth_child = Command::new("node")
      .arg("--input-type=commonjs")
      .arg("-e")
      .arg(unauth_script)
      .env("NODE_PATH", node_root.join("node_modules"))
      .env("SYNC_URL", &base_url)
      .env("WS_ID", &ws_id)
      .stdin(Stdio::piped())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .spawn()
      .unwrap();
    let mut unauth_stdout = tokio::io::BufReader::new(unauth_child.stdout.take().unwrap());
    let mut unauth_sid_line = String::new();
    tokio::io::AsyncBufReadExt::read_line(&mut unauth_stdout, &mut unauth_sid_line)
      .await
      .unwrap();
    let unauth_sid = unauth_sid_line.trim().to_owned();
    tokio::time::sleep(Duration::from_millis(80)).await;
    if let Some(sess) = server.engine().get_by_engine_sid(&unauth_sid).await {
      assert!(
        !sess.has_pending_binary().await,
        "unauthenticated socket must never retain pending_binary"
      );
    }
    unauth_child.stdin.as_mut().unwrap().write_all(b"DONE\n").await.unwrap();
    let _ = unauth_child.wait().await;

    // 2d. Authenticated WS exceeding cumulative BINARY_EVENT byte budget must clear & close session.
    server.engine().set_max_payload_bytes(256);
    let overflow_script = r#"
const wsUrl = process.env.SYNC_URL.replace('http://', 'ws://') + '/socket.io/?EIO=4&transport=websocket';
(async () => {
  const ws = new WebSocket(wsUrl, { headers: { Cookie: process.env.OWNER_COOKIE } });
  const nextMsg = () => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), 3000);
    ws.addEventListener('message', e => { clearTimeout(t); resolve(String(e.data)); }, { once: true });
    ws.addEventListener('error', e => { clearTimeout(t); reject(e); }, { once: true });
  });
  const closed = new Promise(resolve => ws.addEventListener('close', () => resolve(true), { once: true }));
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const openRaw = await nextMsg();
  const sid = JSON.parse(openRaw.slice(1)).sid;
  ws.send('40');
  await nextMsg(); // `40{...}`
  // Header (~140 bytes) + two 100-byte binary frames (> 256 bytes cumulative).
  ws.send('452-3' + JSON.stringify(['space:push-doc-update', {
    spaceType: 'workspace',
    spaceId: process.env.WS_ID,
    docId: 'overflow-doc',
    intent: 'create',
    update: { _placeholder: true, num: 0 },
  }]));
  ws.send(Buffer.alloc(100, 1));
  ws.send(Buffer.alloc(100, 2));
  const wasClosed = await Promise.race([
    closed,
    new Promise(resolve => setTimeout(() => resolve(false), 3000)),
  ]);
  console.log(JSON.stringify({ sid, wasClosed }));
})().catch(e => { console.error(e); process.exit(1); });
"#;
    let overflow_out = run_node_socketio_script(
      overflow_script,
      &[
        ("SYNC_URL", &base_url),
        ("OWNER_COOKIE", &owner_cookie),
        ("WS_ID", &ws_id),
      ],
    )
    .await;
    assert_eq!(overflow_out["wasClosed"], json!(true));
    let overflow_sid = overflow_out["sid"].as_str().unwrap();
    assert!(
      server.engine().get_by_engine_sid(overflow_sid).await.is_none(),
      "overflowing BINARY_EVENT session must be cleaned up"
    );

    http_handle.abort();
    server.shutdown().await;
  });
}

#[test]
fn binary_placeholder_bijection_dos_guards_and_post_lock_grant_refresh() {
  use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
  };

  struct ToggleableQuotaGate {
    readonly: Arc<AtomicBool>,
    first_call_seen: Arc<AtomicBool>,
    first_call_notify: Arc<tokio::sync::Notify>,
  }

  #[async_trait::async_trait]
  impl server_spi::QuotaGate for ToggleableQuotaGate {
    async fn resolve_workspace_grant(
      &self,
      _tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
      _workspace_id: &str,
      _now: chrono::DateTime<chrono::Utc>,
    ) -> Result<server_types::AccessGrant, server_types::DomainError> {
      let mut grant = server_types::license::default_selfhost_access_grant();
      if self.readonly.load(Ordering::Acquire) {
        grant.limits.seat_limit = 0;
      }
      if !self.first_call_seen.swap(true, Ordering::AcqRel) {
        self.first_call_notify.notify_one();
      }
      Ok(grant)
    }

    async fn check_seat_admission(
      &self,
      tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
      workspace_id: &str,
      _current_active_seats: i32,
      _requested_delta: i32,
      now: chrono::DateTime<chrono::Utc>,
    ) -> Result<server_types::AccessGrant, server_types::DomainError> {
      self.resolve_workspace_grant(tx, workspace_id, now).await
    }
  }

  let cluster = PgCluster::from_env_or_docker().expect("PG16 test cluster");
  let redis = TestRedis::from_env_or_docker().expect("Redis 7 test instance");
  let empty = EmptyDbGuard::create(&cluster, "sync_r5");

  let rt = test_runtime();
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig::new(&empty.url))
      .await
      .expect("connect ServerDb");
    db.ensure_schema_ready().await.expect("ensure_schema_ready");

    let (owner_id, owner_session, ws_id) = seed_user_and_workspace(&db).await;

    // 1. Two-transaction concurrent `domain:workspace` lock + post-lock grant refresh:
    //    Tx 1 holds `domain:workspace:<ws>` while concurrent `push_doc_update(Create)`
    //    starts with writable quota and blocks waiting for `domain:workspace:<ws>`.
    //    Tx 1 flips quota to readonly and commits; awakened create MUST fail with QuotaExceeded.
    let readonly = Arc::new(AtomicBool::new(false));
    let first_call_seen = Arc::new(AtomicBool::new(false));
    let first_call_notify = Arc::new(tokio::sync::Notify::new());
    let gate = Arc::new(ToggleableQuotaGate {
      readonly: Arc::clone(&readonly),
      first_call_seen: Arc::clone(&first_call_seen),
      first_call_notify: Arc::clone(&first_call_notify),
    });
    let storage = server_sync::storage::SyncStorage::with_quota_gate(db.clone(), gate);
    let golden = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, GOLDEN_UPDATE_B64).unwrap();

    let mut blocker_tx = db.pool().begin().await.unwrap();
    let lock_key = format!("domain:workspace:{ws_id}");
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
      .bind(&lock_key)
      .execute(&mut *blocker_tx)
      .await
      .unwrap();

    let first_call_waiter = first_call_notify.notified();
    tokio::pin!(first_call_waiter);
    first_call_waiter.as_mut().enable();

    let s_clone = storage.clone();
    let ws_clone = ws_id.clone();
    let owner_clone = owner_id.clone();
    let golden_clone = golden.clone();
    let create_handle = tokio::spawn(async move {
      s_clone
        .push_doc_update(
          server_sync::protocol::SpaceType::Workspace,
          &ws_clone,
          "post-lock-quota-doc",
          &golden_clone,
          &owner_clone,
          server_sync::protocol::PushDocIntent::Create,
          None,
          None,
        )
        .await
    });

    // Wait deterministically for the first (pre-lock) grant check to return `writable`,
    // then flip quota to readonly and release the `domain:workspace` lock so the
    // post-lock grant refresh MUST observe `readonly == true`.
    if !first_call_seen.load(Ordering::Acquire) {
      tokio::time::timeout(Duration::from_secs(5), &mut first_call_waiter)
        .await
        .expect("pre-lock grant check should fire");
    }
    readonly.store(true, Ordering::Release);
    blocker_tx.commit().await.unwrap();

    let err = create_handle.await.unwrap().unwrap_err();
    assert!(
      matches!(err, server_sync::error::SyncError::QuotaExceeded(_)),
      "awakened doc create must re-check grant after acquiring domain:workspace lock, got: {err:?}"
    );

    // 2. BINARY_EVENT placeholder bijection tests:
    //    (a) Positive multi-attachment (2 distinct placeholders 0 & 1) succeeds.
    //    (b) Duplicate placeholder `num: 0` referenced twice -> immediately closes & cleans up.
    //    (c) Out-of-bounds placeholder `num: 5` -> immediately closes & cleans up.
    //    (d) Dangling unreferenced attachment slot -> immediately closes & cleans up.
    let (server, base_url, http_handle) = spawn_sync_server(db.clone(), redis.url()).await;
    let owner_cookie = format!("affine_session={owner_session}; affine_user_id={owner_id}");

    let script = r#"
const wsUrl = process.env.SYNC_URL.replace('http://', 'ws://') + '/socket.io/?EIO=4&transport=websocket';
const cookie = process.env.OWNER_COOKIE;
const wsId = process.env.WS_ID;
const goldenBuf = Buffer.from(process.env.GOLDEN_UPDATE, 'base64');

async function openAuthedWs() {
  const ws = new WebSocket(wsUrl, { headers: { Cookie: cookie } });
  const nextMsg = (prefix = '') => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ws timeout waiting for ' + prefix)), 4000);
    const onMsg = e => {
      const s = String(e.data);
      if (!prefix || s.startsWith(prefix)) {
        clearTimeout(t);
        ws.removeEventListener('message', onMsg);
        resolve(s);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.addEventListener('error', e => { clearTimeout(t); reject(e); }, { once: true });
  });
  const closed = new Promise(resolve => ws.addEventListener('close', () => resolve(true), { once: true }));
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const openRaw = await nextMsg('0');
  const sid = JSON.parse(openRaw.slice(1)).sid;
  ws.send('40');
  await nextMsg('40'); // `40{...}`
  return { ws, sid, nextMsg, closed };
}

(async () => {
  // 2a. Valid 2-attachment BINARY_EVENT (distinct placeholders num:0 and num:1).
  const okConn = await openAuthedWs();
  okConn.ws.send('421' + JSON.stringify(['space:join-batch', {
    spaces: [{ spaceType: 'workspace', spaceId: wsId }],
    clientVersion: '0.27.5',
    protocolVersion: 2,
  }]));
  await okConn.nextMsg('431');
  okConn.ws.send('452-2' + JSON.stringify(['space:push-doc-update', {
    spaceType: 'workspace',
    spaceId: wsId,
    docId: 'multi-bin-doc',
    intent: 'create',
    update: { _placeholder: true, num: 0 },
    ignoredMeta: [{ _placeholder: true, num: 1 }],
  }]));
  okConn.ws.send(goldenBuf);
  okConn.ws.send(Buffer.from('extra-slot'));
  const multiAck = await okConn.nextMsg('432');
  okConn.ws.close();

  // 2b. Duplicate placeholder reference (num:0 referenced twice with 1 attachment).
  const dupConn = await openAuthedWs();
  dupConn.ws.send('451-3' + JSON.stringify(['space:push-doc-update', {
    spaceType: 'workspace',
    spaceId: wsId,
    docId: 'dup-bin-doc',
    updates: [{ _placeholder: true, num: 0 }, { _placeholder: true, num: 0 }],
  }]));
  dupConn.ws.send(goldenBuf);
  const dupClosed = await Promise.race([dupConn.closed, new Promise(r => setTimeout(() => r(false), 3000))]);

  // 2c. Out-of-bounds placeholder reference (num:5 with 1 attachment).
  const oobConn = await openAuthedWs();
  oobConn.ws.send('451-4' + JSON.stringify(['space:push-doc-update', {
    spaceType: 'workspace',
    spaceId: wsId,
    docId: 'oob-bin-doc',
    update: { _placeholder: true, num: 5 },
  }]));
  oobConn.ws.send(goldenBuf);
  const oobClosed = await Promise.race([oobConn.closed, new Promise(r => setTimeout(() => r(false), 3000))]);

  // 2d. Dangling unreferenced attachment (1 attachment declared, 0 placeholders in JSON).
  const dangleConn = await openAuthedWs();
  dangleConn.ws.send('451-5' + JSON.stringify(['space:load-doc-timestamps', {
    spaceType: 'workspace',
    spaceId: wsId,
  }]));
  dangleConn.ws.send(goldenBuf);
  const dangleClosed = await Promise.race([dangleConn.closed, new Promise(r => setTimeout(() => r(false), 3000))]);

  // 2e. Zero-attachment BINARY_EVENT containing a `_placeholder` must disconnect immediately.
  const zeroPlaceholderConn = await openAuthedWs();
  zeroPlaceholderConn.ws.send('450-6' + JSON.stringify(['space:push-doc-update', {
    spaceType: 'workspace',
    spaceId: wsId,
    docId: 'zero-attach-placeholder-doc',
    update: { _placeholder: true, num: 0 },
  }]));
  const zeroPlaceholderClosed = await Promise.race([
    zeroPlaceholderConn.closed,
    new Promise(r => setTimeout(() => r(false), 3000)),
  ]);

  console.log(JSON.stringify({
    multiAck,
    dupClosed,
    dupSid: dupConn.sid,
    oobClosed,
    oobSid: oobConn.sid,
    dangleClosed,
    dangleSid: dangleConn.sid,
    zeroPlaceholderClosed,
    zeroPlaceholderSid: zeroPlaceholderConn.sid,
  }));
})().catch(e => { console.error(e); process.exit(1); });
"#;

    let out = run_node_socketio_script(
      script,
      &[
        ("SYNC_URL", &base_url),
        ("OWNER_COOKIE", &owner_cookie),
        ("WS_ID", &ws_id),
        ("GOLDEN_UPDATE", GOLDEN_UPDATE_B64),
      ],
    )
    .await;

    assert!(
      out["multiAck"].as_str().unwrap().contains(r#""accepted":true"#),
      "valid 2-attachment BINARY_EVENT must succeed: {:?}",
      out["multiAck"]
    );
    assert_eq!(out["dupClosed"], json!(true));
    assert_eq!(out["oobClosed"], json!(true));
    assert_eq!(out["dangleClosed"], json!(true));
    assert_eq!(out["zeroPlaceholderClosed"], json!(true));
    for key in ["dupSid", "oobSid", "dangleSid", "zeroPlaceholderSid"] {
      let sid = out[key].as_str().unwrap();
      assert!(
        server.engine().get_by_engine_sid(sid).await.is_none(),
        "{key} session must be cleaned up"
      );
    }

    http_handle.abort();
    server.shutdown().await;
  });
}

async fn create_empty_db_off_runtime(prefix: &'static str) -> EmptyDbGuard {
  let (tx, rx) = tokio::sync::oneshot::channel();
  std::thread::spawn(move || {
    let cluster = PgCluster::from_env_or_docker().expect("PG16 cluster");
    let empty = EmptyDbGuard::create(&cluster, prefix);
    let _ = tx.send(empty);
  });
  rx.await.expect("empty db setup thread panicked")
}

async fn drop_empty_db_off_runtime(empty: EmptyDbGuard) {
  let (tx, rx) = tokio::sync::oneshot::channel();
  std::thread::spawn(move || {
    drop(empty);
    let _ = tx.send(());
  });
  rx.await.expect("empty db teardown thread panicked");
}

#[tokio::test]
async fn userspace_mutex_ioredis_cross_gen_interop_ignores_key_prefix_on_session_db() {
  let redis = TestRedis::from_env_or_docker().expect("Redis 7");
  let empty = create_empty_db_off_runtime("userspace_ioredis").await;
  let db_url = empty.url.clone();

  let db = ServerDb::connect(DbConfig::new(&db_url))
    .await
    .expect("connect test db");
  db.ensure_schema_ready().await.expect("ensure schema ready");

  let (user_id, _session_id, _ws_id) = seed_user_and_workspace(&db).await;

  // Non-zero base_db = 1 -> session_db = 3 via server_worker::session_redis_url.
  let base_url = {
    let (scheme, rest) = redis.url().split_once("://").expect("redis url scheme");
    let authority = rest.split_once('/').map(|(a, _)| a).unwrap_or(rest);
    format!("{scheme}://{authority}/1")
  };
  let (session_url, session_db) = server_worker::session_redis_url(&base_url).expect("session_redis_url");
  assert_eq!(session_db, 3);

  let storage = server_sync::storage::SyncStorage::new(db.clone())
    .with_session_redis_url(&session_url)
    .expect("configure session redis");

  let update_a = {
    let doc = y_octo::Doc::with_client(101);
    let mut meta = doc.get_or_create_map("meta").unwrap();
    meta.insert("a".to_owned(), "from-legacy".to_owned()).unwrap();
    doc.encode_update_v1().unwrap()
  };
  let update_b = {
    let doc = y_octo::Doc::with_client(202);
    let mut meta = doc.get_or_create_map("meta").unwrap();
    meta.insert("b".to_owned(), "from-v2".to_owned()).unwrap();
    doc.encode_update_v1().unwrap()
  };

  let doc1 = format!("doc-ioredis-{}", Uuid::new_v4().simple());
  let doc2 = format!("doc-rust-holds-{}", Uuid::new_v4().simple());
  let node_root = locate_node_modules_root();
  let node_path = node_root.join("node_modules");

  // Direction 1: Node ioredis with non-empty `keyPrefix: "tenant:"` on `db: 3`
  // executes `locker.ts` verbatim `new Command('EVAL', [lockScript, '1', 'MutexLock:' + key, owner])`.
  // `ioredis 5.11.1` ignores `keyPrefix` for raw `new Command('EVAL', ...)`, locking literal
  // `MutexLock:userspace:<u1>:<d1>`. Rust must block on it, wait for unlock, and merge A + B.
  let hold_script = r#"
const Redis = require('ioredis');
const { Command } = Redis;
const lockScript = `local key = KEYS[1]
local owner = ARGV[1]
if redis.call("get", key) == owner then
  return 0
elseif redis.call("set", key, owner, "NX", "EX", 60) then
  return 1
else
  return 0
end`;
const unlockScript = `local key = KEYS[1]
local owner = ARGV[1]
local value = redis.call("get", key)
if value == owner then
  return redis.call("del", key)
elseif value == nil then
  return 1
else
  return 0
end`;
(async () => {
  const client = new Redis(process.env.SESSION_REDIS_URL, { keyPrefix: 'tenant:' });
  const lockKey = 'MutexLock:userspace:' + process.env.USER_ID + ':' + process.env.DOC_ID;
  const owner = 'legacy-ioredis-' + Date.now();
  const acquired = await client.sendCommand(new Command('EVAL', [lockScript, '1', lockKey, owner]));
  if (acquired !== 1) throw new Error('expected acquired=1, got ' + acquired);
  process.stdout.write('LOCKED\n');
  await new Promise((resolve) => process.stdin.once('data', resolve));
  const released = await client.sendCommand(new Command('EVAL', [unlockScript, '1', lockKey, owner]));
  if (released !== 1) throw new Error('expected released=1, got ' + released);
  await client.quit();
})().catch((e) => { console.error(e); process.exit(1); });
"#;

  let mut child = Command::new("node")
    .arg("--input-type=commonjs")
    .arg("-e")
    .arg(hold_script)
    .env("NODE_PATH", &node_path)
    .env("SESSION_REDIS_URL", &session_url)
    .env("USER_ID", &user_id)
    .env("DOC_ID", &doc1)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .expect("spawn node ioredis holder");

  {
    use tokio::io::{AsyncBufReadExt, BufReader};
    let mut stdout = BufReader::new(child.stdout.take().expect("stdout"));
    let mut line = String::new();
    tokio::time::timeout(Duration::from_secs(10), stdout.read_line(&mut line))
      .await
      .expect("wait for LOCKED")
      .expect("read LOCKED");
    assert_eq!(line.trim(), "LOCKED", "node ioredis holder must acquire lock first");
  }

  // While ioredis holds the lock, start Rust push_doc_update, write legacy doc A, then signal release.
  let storage_clone = storage.clone();
  let user_clone = user_id.clone();
  let doc1_clone = doc1.clone();
  let update_b_clone = update_b.clone();
  let rust_push = tokio::spawn(async move {
    storage_clone
      .push_doc_update(
        server_sync::protocol::SpaceType::Userspace,
        &user_clone,
        &doc1_clone,
        &update_b_clone,
        &user_clone,
        server_sync::protocol::PushDocIntent::Update,
        None,
        None,
      )
      .await
  });

  sqlx::query(
    "INSERT INTO user_snapshots(user_id, id, blob, created_at, updated_at) \
     VALUES ($1, $2, $3, now(), now())",
  )
  .bind(&user_id)
  .bind(&doc1)
  .bind(&update_a)
  .execute(db.pool())
  .await
  .expect("legacy write user_snapshots");

  {
    let mut stdin = child.stdin.take().expect("stdin");
    stdin.write_all(b"UNLOCK\n").await.expect("signal unlock");
  }
  let node_status = child.wait_with_output().await.expect("wait node holder");
  assert!(
    node_status.status.success(),
    "node ioredis holder failed: {}",
    String::from_utf8_lossy(&node_status.stderr)
  );

  let pushed = rust_push
    .await
    .expect("join rust push")
    .expect("rust push must succeed after ioredis releases lock");
  assert!(!pushed.created, "must observe legacy row A and merge");

  let merged_blob: Vec<u8> = sqlx::query_scalar("SELECT blob FROM user_snapshots WHERE user_id = $1 AND id = $2")
    .bind(&user_id)
    .bind(&doc1)
    .fetch_one(db.pool())
    .await
    .expect("load merged doc");
  let merged_doc = y_octo::Doc::try_from_binary_v1(&merged_blob).expect("decode merged");
  let meta = merged_doc.get_map("meta").expect("meta map");
  assert_eq!(
    meta.get("a"),
    Some(y_octo::Value::Any(y_octo::Any::String("from-legacy".into())))
  );
  assert_eq!(
    meta.get("b"),
    Some(y_octo::Value::Any(y_octo::Any::String("from-v2".into())))
  );

  // Direction 2: Rust holds the lock (paused at the Redis TCP proxy right when
  // `FENCE_AND_RENEW` arrives before PG commit), and Node ioredis (with
  // keyPrefix: "tenant:") attempts `EVAL` -> must observe 0 (contended on the
  // exact same key!).
  let upstream_addr = {
    let without_scheme = session_url.split_once("://").unwrap().1;
    without_scheme
      .split_once('/')
      .map(|(a, _)| a)
      .unwrap_or(without_scheme)
      .to_owned()
  };
  let fence_reached = std::sync::Arc::new(tokio::sync::Notify::new());
  let release_fence = std::sync::Arc::new(tokio::sync::Notify::new());
  let fence_hash = redis::Script::new(
    r#"
if redis.call("get", KEYS[1]) == ARGV[1] and redis.call("pttl", KEYS[1]) > 0 then
  redis.call("pexpire", KEYS[1], tonumber(ARGV[2]))
  return 1
else
  return 0
end
"#,
  )
  .get_hash()
  .to_owned();

  let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
  let proxy_port = listener.local_addr().unwrap().port();
  let proxy_session_url = format!("redis://127.0.0.1:{proxy_port}/{session_db}");
  let fence_reached_c = std::sync::Arc::clone(&fence_reached);
  let release_fence_c = std::sync::Arc::clone(&release_fence);
  let proxy_task = tokio::spawn(async move {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let mut paused_once = false;
    while let Ok((client, _)) = listener.accept().await {
      let upstream = tokio::net::TcpStream::connect(&upstream_addr).await.unwrap();
      let (mut cr, mut cw) = client.into_split();
      let (mut ur, mut uw) = upstream.into_split();
      let fence_reached_c = std::sync::Arc::clone(&fence_reached_c);
      let release_fence_c = std::sync::Arc::clone(&release_fence_c);
      let fence_hash_c = fence_hash.clone();
      let should_pause = !paused_once;
      paused_once = true;
      tokio::spawn(async move {
        let mut buf = [0u8; 8192];
        let mut did_pause = false;
        while let Ok(n) = cr.read(&mut buf).await {
          if n == 0 {
            break;
          }
          let chunk = &buf[..n];
          if should_pause
            && !did_pause
            && (chunk.windows(fence_hash_c.len()).any(|w| w == fence_hash_c.as_bytes())
              || chunk.windows(21).any(|w| w == b"and redis.call(\"pttl\""))
          {
            did_pause = true;
            fence_reached_c.notify_one();
            release_fence_c.notified().await;
          }
          if uw.write_all(chunk).await.is_err() {
            break;
          }
        }
      });
      tokio::spawn(async move {
        let _ = tokio::io::copy(&mut ur, &mut cw).await;
      });
    }
  });

  let proxied_storage = server_sync::storage::SyncStorage::new(db.clone())
    .with_session_redis_url(&proxy_session_url)
    .expect("configure proxied session redis");

  let u_c = user_id.clone();
  let d2_c = doc2.clone();
  let ub_c = update_b.clone();
  let rust_holder = tokio::spawn(async move {
    proxied_storage
      .push_doc_update(
        server_sync::protocol::SpaceType::Userspace,
        &u_c,
        &d2_c,
        &ub_c,
        &u_c,
        server_sync::protocol::PushDocIntent::Update,
        None,
        None,
      )
      .await
  });
  fence_reached.notified().await;

  let probe_script = r#"
const Redis = require('ioredis');
const { Command } = Redis;
const lockScript = `local key = KEYS[1]
local owner = ARGV[1]
if redis.call("get", key) == owner then
  return 0
elseif redis.call("set", key, owner, "NX", "EX", 60) then
  return 1
else
  return 0
end`;
(async () => {
  const client = new Redis(process.env.SESSION_REDIS_URL, { keyPrefix: 'tenant:' });
  const lockKey = 'MutexLock:userspace:' + process.env.USER_ID + ':' + process.env.DOC_ID;
  const acquired = await client.sendCommand(new Command('EVAL', [lockScript, '1', lockKey, 'legacy-probe']));
  console.log(JSON.stringify({ acquired }));
  await client.quit();
})().catch((e) => { console.error(e); process.exit(1); });
"#;
  let probe_out = run_node_socketio_script(
    probe_script,
    &[
      ("SESSION_REDIS_URL", &session_url),
      ("USER_ID", &user_id),
      ("DOC_ID", &doc2),
    ],
  )
  .await;
  assert_eq!(
    probe_out["acquired"],
    json!(0),
    "ioredis must be blocked by Rust's MutexLock:userspace:<uid>:<doc>"
  );

  release_fence.notify_one();
  rust_holder
    .await
    .expect("join rust holder")
    .expect("rust holder commits after release");
  proxy_task.abort();

  db.pool().close().await;
  drop(db);
  drop_empty_db_off_runtime(empty).await;
}

#[tokio::test]
async fn userspace_mutex_pre_commit_fence_rolls_back_on_lease_expiry_and_retry_merges() {
  let redis = TestRedis::from_env_or_docker().expect("Redis 7");
  let empty = create_empty_db_off_runtime("userspace_fence").await;
  let db_url = empty.url.clone();

  let db = ServerDb::connect(DbConfig::new(&db_url))
    .await
    .expect("connect test db");
  db.ensure_schema_ready().await.expect("ensure schema ready");

  let (user_id, _session_id, _ws_id) = seed_user_and_workspace(&db).await;
  let (session_url, session_db) = server_worker::session_redis_url(redis.url()).expect("session_redis_url");
  let session_client = redis::Client::open(session_url.as_str()).expect("open session redis");

  let update_a = {
    let doc = y_octo::Doc::with_client(301);
    let mut meta = doc.get_or_create_map("meta").unwrap();
    meta.insert("a".to_owned(), "writer-a".to_owned()).unwrap();
    doc.encode_update_v1().unwrap()
  };
  let update_b = {
    let doc = y_octo::Doc::with_client(302);
    let mut meta = doc.get_or_create_map("meta").unwrap();
    meta.insert("b".to_owned(), "writer-b".to_owned()).unwrap();
    doc.encode_update_v1().unwrap()
  };

  let doc_id = format!("doc-fence-{}", Uuid::new_v4().simple());
  let lock_key = format!("MutexLock:userspace:{user_id}:{doc_id}");

  // Route Writer B through a Redis TCP proxy (with production ttl/3 renewal
  // running untouched): block background RENEW calls and pause FENCE_AND_RENEW
  // right before PG commit until the 150ms lock expires and a foreign owner
  // claims it on real TestRedis.
  let upstream_addr = {
    let without_scheme = session_url.split_once("://").unwrap().1;
    without_scheme
      .split_once('/')
      .map(|(a, _)| a)
      .unwrap_or(without_scheme)
      .to_owned()
  };
  let renew_hash = redis::Script::new(
    r#"
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], tonumber(ARGV[2]))
else
  return 0
end
"#,
  )
  .get_hash()
  .to_owned();
  let fence_hash = redis::Script::new(
    r#"
if redis.call("get", KEYS[1]) == ARGV[1] and redis.call("pttl", KEYS[1]) > 0 then
  redis.call("pexpire", KEYS[1], tonumber(ARGV[2]))
  return 1
else
  return 0
end
"#,
  )
  .get_hash()
  .to_owned();

  let fence_reached = std::sync::Arc::new(tokio::sync::Notify::new());
  let release_fence = std::sync::Arc::new(tokio::sync::Notify::new());
  let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
  let proxy_port = listener.local_addr().unwrap().port();
  let proxy_session_url = format!("redis://127.0.0.1:{proxy_port}/{session_db}");

  let fence_reached_c = std::sync::Arc::clone(&fence_reached);
  let release_fence_c = std::sync::Arc::clone(&release_fence);
  let proxy_task = tokio::spawn(async move {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    while let Ok((client, _)) = listener.accept().await {
      let upstream = tokio::net::TcpStream::connect(&upstream_addr).await.unwrap();
      let (mut cr, cw) = client.into_split();
      let (mut ur, mut uw) = upstream.into_split();
      let cw = std::sync::Arc::new(tokio::sync::Mutex::new(cw));
      let cw_client = std::sync::Arc::clone(&cw);
      let fence_reached_c = std::sync::Arc::clone(&fence_reached_c);
      let release_fence_c = std::sync::Arc::clone(&release_fence_c);
      let renew_hash_c = renew_hash.clone();
      let fence_hash_c = fence_hash.clone();
      tokio::spawn(async move {
        let mut buf = [0u8; 8192];
        while let Ok(n) = cr.read(&mut buf).await {
          if n == 0 {
            break;
          }
          let chunk = &buf[..n];
          let is_fence = chunk.windows(fence_hash_c.len()).any(|w| w == fence_hash_c.as_bytes())
            || chunk.windows(21).any(|w| w == b"and redis.call(\"pttl\"");
          let is_renew = !is_fence && chunk.windows(renew_hash_c.len()).any(|w| w == renew_hash_c.as_bytes());
          if is_renew {
            let mut w = cw_client.lock().await;
            if w.write_all(b":0\r\n").await.is_err() {
              break;
            }
            continue;
          }
          if is_fence {
            fence_reached_c.notify_one();
            release_fence_c.notified().await;
          }
          if uw.write_all(chunk).await.is_err() {
            break;
          }
        }
      });
      tokio::spawn(async move {
        let mut buf = [0u8; 8192];
        while let Ok(n) = ur.read(&mut buf).await {
          if n == 0 {
            break;
          }
          let mut w = cw.lock().await;
          if w.write_all(&buf[..n]).await.is_err() {
            break;
          }
        }
      });
    }
  });

  let short_ttl_storage = server_sync::storage::SyncStorage::new(db.clone())
    .with_session_redis_url(&proxy_session_url)
    .expect("session redis")
    .with_userspace_lock_ttl_ms(150);

  let u_c = user_id.clone();
  let d_c = doc_id.clone();
  let ub_c = update_b.clone();
  let stale_writer = tokio::spawn(async move {
    short_ttl_storage
      .push_doc_update(
        server_sync::protocol::SpaceType::Userspace,
        &u_c,
        &d_c,
        &ub_c,
        &u_c,
        server_sync::protocol::PushDocIntent::Update,
        None,
        None,
      )
      .await
  });

  fence_reached.notified().await;

  // Wait deterministically for the 150ms Redis key to expire, then claim it as a foreign owner.
  let mut conn = session_client.get_multiplexed_async_connection().await.unwrap();
  let mut expired = false;
  for _ in 0..100 {
    let val: Option<String> = conn.get(&lock_key).await.unwrap();
    if val.is_none() {
      expired = true;
      break;
    }
    tokio::time::sleep(Duration::from_millis(15)).await;
  }
  assert!(expired, "short TTL lock must expire while paused before commit");
  let _: String = redis::cmd("SET")
    .arg(&lock_key)
    .arg("foreign-owner")
    .arg("PX")
    .arg(60_000)
    .query_async(&mut conn)
    .await
    .unwrap();

  // Release stale_writer: its pre-commit atomic fence MUST fail and roll back!
  release_fence.notify_one();
  let stale_err = stale_writer
    .await
    .expect("join stale writer")
    .expect_err("stale writer must fail pre-commit fence and roll back");
  assert!(matches!(stale_err, server_sync::error::SyncError::Internal(_)));
  proxy_task.abort();

  // Release the foreign owner's lock before verifying clean retry writes.
  let _: i32 = conn.del(&lock_key).await.unwrap();

  // Verify nothing was committed by stale_writer.
  let row_after_rollback: Option<Vec<u8>> =
    sqlx::query_scalar("SELECT blob FROM user_snapshots WHERE user_id = $1 AND id = $2")
      .bind(&user_id)
      .bind(&doc_id)
      .fetch_optional(db.pool())
      .await
      .unwrap();
  assert!(
    row_after_rollback.is_none(),
    "rolled-back stale writer must not commit user_snapshots"
  );

  // Now writer A commits update_a, and writer B retries cleanly -> CRDT merge preserves both A and B.
  let normal_storage = server_sync::storage::SyncStorage::new(db.clone())
    .with_session_redis_url(&session_url)
    .expect("session redis");
  normal_storage
    .push_doc_update(
      server_sync::protocol::SpaceType::Userspace,
      &user_id,
      &doc_id,
      &update_a,
      &user_id,
      server_sync::protocol::PushDocIntent::Update,
      None,
      None,
    )
    .await
    .expect("writer A succeeds");
  normal_storage
    .push_doc_update(
      server_sync::protocol::SpaceType::Userspace,
      &user_id,
      &doc_id,
      &update_b,
      &user_id,
      server_sync::protocol::PushDocIntent::Update,
      None,
      None,
    )
    .await
    .expect("writer B retry succeeds");

  let final_blob: Vec<u8> = sqlx::query_scalar("SELECT blob FROM user_snapshots WHERE user_id = $1 AND id = $2")
    .bind(&user_id)
    .bind(&doc_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
  let final_doc = y_octo::Doc::try_from_binary_v1(&final_blob).unwrap();
  let meta = final_doc.get_map("meta").unwrap();
  assert_eq!(
    meta.get("a"),
    Some(y_octo::Value::Any(y_octo::Any::String("writer-a".into())))
  );
  assert_eq!(
    meta.get("b"),
    Some(y_octo::Value::Any(y_octo::Any::String("writer-b".into())))
  );

  db.pool().close().await;
  drop(db);
  drop_empty_db_off_runtime(empty).await;
}

#[tokio::test]
async fn userspace_mutex_cancel_safe_release_cleans_up_on_immediate_cancel() {
  let redis = TestRedis::from_env_or_docker().expect("Redis 7");
  let (session_url, session_db) = server_worker::session_redis_url(redis.url()).expect("session_redis_url");
  let upstream_addr = {
    let without_scheme = session_url.split_once("://").unwrap().1;
    without_scheme
      .split_once('/')
      .map(|(a, _)| a)
      .unwrap_or(without_scheme)
      .to_owned()
  };
  let unlock_hash = redis::Script::new(
    r#"
local value = redis.call("get", KEYS[1])
if value == ARGV[1] then
  return redis.call("del", KEYS[1])
elseif not value then
  return 1
else
  return 0
end
"#,
  )
  .get_hash()
  .to_owned();

  let unlock_started = std::sync::Arc::new(tokio::sync::Notify::new());
  let (allow_reply_tx, allow_reply_rx) = tokio::sync::watch::channel(false);
  let hold_reply = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
  let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
  let proxy_port = listener.local_addr().unwrap().port();
  let proxy_url = format!("redis://127.0.0.1:{proxy_port}/{session_db}");

  let unlock_started_c = std::sync::Arc::clone(&unlock_started);
  let hold_reply_c = std::sync::Arc::clone(&hold_reply);
  let proxy_task = tokio::spawn(async move {
    use std::sync::atomic::Ordering;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    while let Ok((client, _)) = listener.accept().await {
      let upstream = tokio::net::TcpStream::connect(&upstream_addr).await.unwrap();
      let (mut cr, mut cw) = client.into_split();
      let (mut ur, mut uw) = upstream.into_split();
      let unlock_started_c = std::sync::Arc::clone(&unlock_started_c);
      let mut allow_reply_rx_u = allow_reply_rx.clone();
      let hold_c = std::sync::Arc::clone(&hold_reply_c);
      let hold_r = std::sync::Arc::clone(&hold_reply_c);
      let unlock_hash_c = unlock_hash.clone();
      tokio::spawn(async move {
        let mut buf = [0u8; 8192];
        while let Ok(n) = cr.read(&mut buf).await {
          if n == 0 {
            break;
          }
          let chunk = &buf[..n];
          if chunk
            .windows(unlock_hash_c.len())
            .any(|w| w == unlock_hash_c.as_bytes())
            || chunk.windows(16).any(|w| w == b"elseif not value")
          {
            hold_c.store(true, Ordering::Release);
            unlock_started_c.notify_one();
          }
          if uw.write_all(chunk).await.is_err() {
            break;
          }
        }
      });
      tokio::spawn(async move {
        let mut buf = [0u8; 8192];
        while let Ok(n) = ur.read(&mut buf).await {
          if n == 0 {
            break;
          }
          if hold_r.load(Ordering::Acquire) && !*allow_reply_rx_u.borrow() {
            let _ = allow_reply_rx_u.wait_for(|allowed| *allowed).await;
          }
          if cw.write_all(&buf[..n]).await.is_err() {
            break;
          }
        }
      });
    }
  });

  let direct_mutex = server_worker::RedisMutex::new(&session_url, "").expect("direct redis mutex");
  let proxied_mutex = server_worker::RedisMutex::new(&proxy_url, "").expect("proxied redis mutex");

  let resource = format!("userspace:cancel:{}", Uuid::new_v4().simple());
  let lease = proxied_mutex
    .try_acquire_ms(&resource, server_worker::new_owner_token("cancel-test"), 60_000)
    .await
    .expect("acquire lease");
  assert!(direct_mutex.current_owner(&resource).await.unwrap().is_some());

  // Keep a live clone of `lease` (`Arc::strong_count >= 2`) throughout so
  // `Drop` cannot fire and cleanup MUST come solely from the spawned task
  // inside `lease.release()`.
  let keep_alive = lease.clone();
  tokio::select! {
    _ = lease.release() => panic!("release future must be cancelled in flight"),
    () = unlock_started.notified() => {}
  }

  let _ = allow_reply_tx.send(true);

  let mut cleared = false;
  for _ in 0..100 {
    if direct_mutex.current_owner(&resource).await.unwrap().is_none() {
      cleared = true;
      break;
    }
    tokio::time::sleep(Duration::from_millis(15)).await;
  }
  assert!(
    cleared,
    "cancelled in-flight release must still delete Redis key while keep_alive is alive"
  );
  assert!(!keep_alive.owner_token().is_empty());
  drop(keep_alive);
  proxy_task.abort();
}

#[tokio::test]
async fn userspace_mutex_invalid_session_redis_url_fails_closed() {
  let empty = create_empty_db_off_runtime("userspace_failclosed").await;
  let db_url = empty.url.clone();

  let db = ServerDb::connect(DbConfig::new(&db_url))
    .await
    .expect("connect test db");
  db.ensure_schema_ready().await.expect("ensure schema ready");
  let (user_id, _session_id, _ws_id) = seed_user_and_workspace(&db).await;

  let update = {
    let doc = y_octo::Doc::with_client(401);
    let mut meta = doc.get_or_create_map("meta").unwrap();
    meta.insert("k".to_owned(), "v".to_owned()).unwrap();
    doc.encode_update_v1().unwrap()
  };

  let invalid_server = SyncServer::start(
    db.clone(),
    SyncConfig {
      session_redis_url: Some("not-a-valid-redis-url".to_owned()),
      ..SyncConfig::default()
    },
  )
  .await;
  let err = invalid_server
    .gateway()
    .storage()
    .push_doc_update(
      server_sync::protocol::SpaceType::Userspace,
      &user_id,
      "doc-invalid-url",
      &update,
      &user_id,
      server_sync::protocol::PushDocIntent::Update,
      None,
      None,
    )
    .await
    .expect_err("invalid session_redis_url must fail closed");
  assert!(matches!(err, server_sync::error::SyncError::Internal(_)));

  // Also verify TooManyConcurrentWritings maps to 0.27.5 500 INTERNAL_ERROR wire envelope.
  let ws_err = server_sync::legacy_compat::errors::sync_error_to_ws_envelope(
    &server_sync::error::SyncError::TooManyConcurrentWritings,
    None,
  );
  assert_eq!(ws_err.error.status, 500);
  assert_eq!(ws_err.error.code, "INTERNAL_SERVER_ERROR");
  assert_eq!(ws_err.error.error_type, "INTERNAL_ERROR");
  assert_eq!(ws_err.error.name, "INTERNAL_SERVER_ERROR");
  assert_eq!(ws_err.error.message, "Internal Server Error");

  invalid_server.shutdown().await;
  db.pool().close().await;
  drop(db);
  drop_empty_db_off_runtime(empty).await;
}

#[tokio::test]
async fn userspace_concurrent_first_create_merges_bc_from_empty_table() {
  let redis = TestRedis::from_env_or_docker().expect("Redis 7");
  let empty = create_empty_db_off_runtime("userspace_empty_bc").await;
  let db_url = empty.url.clone();

  let db = ServerDb::connect(DbConfig::new(&db_url))
    .await
    .expect("connect test db");
  db.ensure_schema_ready().await.expect("ensure schema ready");

  let (user_id, _session_id, _ws_id) = seed_user_and_workspace(&db).await;
  let (session_url, _) = server_worker::session_redis_url(redis.url()).expect("session_redis_url");
  let storage = server_sync::storage::SyncStorage::new(db.clone())
    .with_session_redis_url(&session_url)
    .expect("configure session redis");

  let encode_meta = |client_id: u64, key: &str, value: &str| {
    let doc = y_octo::Doc::with_client(client_id);
    let mut meta = doc.get_or_create_map("meta").unwrap();
    meta.insert(key.to_owned(), value.to_owned()).unwrap();
    doc.encode_update_v1().unwrap()
  };

  let update_b = encode_meta(601, "b", "rust-b");
  let update_c = encode_meta(602, "c", "legacy-c");
  let doc_id = format!("doc-empty-bc-{}", Uuid::new_v4().simple());

  // Start from an empty `user_snapshots` row for `(user_id, doc_id)`.
  // Session 1 (frozen legacy writer) opens a PG tx and inserts C WITHOUT committing yet.
  // Under READ COMMITTED, Rust's `SELECT ... FOR UPDATE` sees `None`, then its
  // `INSERT ... ON CONFLICT (user_id, id) DO NOTHING` deterministically blocks on
  // Session 1's uncommitted unique-index tuple until Session 1 commits C.
  let mut legacy_tx = db.pool().begin().await.expect("begin legacy tx");
  sqlx::query(
    "INSERT INTO user_snapshots(user_id, id, blob, created_at, updated_at)
     VALUES ($1, $2, $3, clock_timestamp(), clock_timestamp())",
  )
  .bind(&user_id)
  .bind(&doc_id)
  .bind(&update_c)
  .execute(&mut *legacy_tx)
  .await
  .expect("legacy insert C");

  let storage_c = storage.clone();
  let uid_c = user_id.clone();
  let doc_c = doc_id.clone();
  let ub_c = update_b.clone();
  let rust_task = tokio::spawn(async move {
    storage_c
      .push_doc_update(
        server_sync::protocol::SpaceType::Userspace,
        &uid_c,
        &doc_c,
        &ub_c,
        &uid_c,
        server_sync::protocol::PushDocIntent::Create,
        None,
        None,
      )
      .await
  });

  // Wait deterministically until Rust's `INSERT ... ON CONFLICT (user_id, id) DO NOTHING`
  // is blocked on Session 1's uncommitted tuple in `pg_stat_activity`.
  let mut blocked = false;
  for _ in 0..200 {
    let waiting: bool = sqlx::query_scalar(
      "SELECT EXISTS(
         SELECT 1 FROM pg_stat_activity
         WHERE datname = current_database()
           AND wait_event_type = 'Lock'
           AND query LIKE '%ON CONFLICT (user_id, id) DO NOTHING%'
       )",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    if waiting {
      blocked = true;
      break;
    }
    tokio::time::sleep(Duration::from_millis(10)).await;
  }
  assert!(
    blocked,
    "Rust empty-table INSERT ON CONFLICT DO NOTHING must block on uncommitted legacy INSERT C"
  );

  // Commit legacy C -> unblocks Rust INSERT (rows_affected = 0) -> Rust re-reads C
  // FOR UPDATE, merges [C, B], and commits B+C.
  legacy_tx.commit().await.expect("commit legacy C");
  let rust_res = rust_task
    .await
    .expect("join rust task")
    .expect("rust push must merge B+C after ON CONFLICT DO NOTHING");
  assert!(!rust_res.created, "must observe legacy C and update with B+C");

  let final_blob: Vec<u8> = sqlx::query_scalar("SELECT blob FROM user_snapshots WHERE user_id = $1 AND id = $2")
    .bind(&user_id)
    .bind(&doc_id)
    .fetch_one(db.pool())
    .await
    .expect("load final user_snapshots blob");
  let final_doc = y_octo::Doc::try_from_binary_v1(&final_blob).expect("decode final doc");
  let meta = final_doc.get_map("meta").expect("meta map");
  assert_eq!(
    meta.get("b"),
    Some(y_octo::Value::Any(y_octo::Any::String("rust-b".into())))
  );
  assert_eq!(
    meta.get("c"),
    Some(y_octo::Value::Any(y_octo::Any::String("legacy-c".into())))
  );

  db.pool().close().await;
  drop(db);
  drop_empty_db_off_runtime(empty).await;
}

#[tokio::test]
async fn userspace_sync_server_operates_under_max_connections_one() {
  let redis = TestRedis::from_env_or_docker().expect("Redis 7");
  let empty = create_empty_db_off_runtime("userspace_max_conn_one").await;
  let db_url = empty.url.clone();

  let db = ServerDb::connect(DbConfig {
    max_connections: 1,
    ..DbConfig::new(&db_url)
  })
  .await
  .expect("connect test db with max_connections=1");
  db.ensure_schema_ready().await.expect("ensure schema ready");

  let (user_id, _session_id, _ws_id) = seed_user_and_workspace(&db).await;
  let (session_url, _) = server_worker::session_redis_url(redis.url()).expect("session_redis_url");

  let server = SyncServer::start(
    db.clone(),
    SyncConfig {
      redis_url: Some(redis.url().to_owned()),
      session_redis_url: Some(session_url),
      ..SyncConfig::for_deployment_channel("test")
    },
  )
  .await;
  let storage = server.gateway().storage().clone();

  let doc = y_octo::Doc::with_client(601);
  {
    let mut meta = doc.get_or_create_map("meta").unwrap();
    meta.insert("k".to_owned(), "single-conn".to_owned()).unwrap();
  }
  let update = doc.encode_update_v1().unwrap();
  let doc_id = format!("doc-max-conn-1-{}", Uuid::new_v4().simple());

  tokio::time::timeout(Duration::from_secs(5), async {
    let pushed = storage
      .push_doc_update(
        server_sync::protocol::SpaceType::Userspace,
        &user_id,
        &doc_id,
        &update,
        &user_id,
        server_sync::protocol::PushDocIntent::Create,
        None,
        None,
      )
      .await
      .expect("userspace push succeeds under max_connections=1");
    assert!(pushed.created);

    let diff = storage
      .load_doc_diff(server_sync::protocol::SpaceType::Userspace, &user_id, &doc_id, None)
      .await
      .expect("userspace load_doc_diff succeeds under max_connections=1")
      .expect("userspace doc exists");
    let decoded = y_octo::Doc::try_from_binary_v1(&diff.missing).expect("decode diff");
    let meta = decoded.get_map("meta").expect("meta map");
    assert_eq!(
      meta.get("k"),
      Some(y_octo::Value::Any(y_octo::Any::String("single-conn".into())))
    );

    server.shutdown().await;
  })
  .await
  .expect("SyncServer push/load/shutdown must finish within 5s under max_connections=1");

  db.pool().close().await;
  drop(db);
  drop_empty_db_off_runtime(empty).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn realtime_workspace_access_public_nonmember_and_unsubscribe() {
  let redis = TestRedis::from_env_or_docker().expect("Redis 7");
  let empty = create_empty_db_off_runtime("realtime_public_nonmember").await;
  let db = ServerDb::connect(DbConfig::new(&empty.url))
    .await
    .expect("connect test db");
  db.ensure_schema_ready().await.expect("ensure schema ready");
  let (_owner_id, _owner_session, ws_id) = seed_user_and_workspace(&db).await;

  // Make the workspace public and seed an authenticated non-member.
  sqlx::query(
    "INSERT INTO workspace_access_policies(workspace_id, visibility, sharing_enabled, url_preview_enabled)
     VALUES ($1, 'public', true, false)
     ON CONFLICT (workspace_id) DO UPDATE SET visibility = 'public'",
  )
  .bind(&ws_id)
  .execute(db.pool())
  .await
  .unwrap();

  let outsider_id = Uuid::new_v4().to_string();
  let outsider_session = Uuid::new_v4().to_string();
  sqlx::query("INSERT INTO users(id, name, email, registered, disabled) VALUES ($1, 'Outsider', $2, true, false)")
    .bind(&outsider_id)
    .bind(format!("outsider-{}@affine.test", &outsider_id[..8]))
    .execute(db.pool())
    .await
    .unwrap();
  sqlx::query("INSERT INTO multiple_users_sessions(id) VALUES ($1)")
    .bind(&outsider_session)
    .execute(db.pool())
    .await
    .unwrap();
  sqlx::query(
    "INSERT INTO user_sessions(id, session_id, user_id, expires_at) VALUES ($1, $2, $3, now() + interval '15 days')",
  )
  .bind(Uuid::new_v4().to_string())
  .bind(&outsider_session)
  .bind(&outsider_id)
  .execute(db.pool())
  .await
  .unwrap();

  let (server, base_url, http_handle) = spawn_sync_server(db.clone(), redis.url()).await;

  let script = r#"
const { io } = require('socket.io-client');
(async () => {
  const sock = io(process.env.SYNC_URL, {
    path: '/socket.io/',
    transports: ['websocket'],
    extraHeaders: { Cookie: process.env.OUTSIDER_COOKIE },
  });
  await new Promise((resolve, reject) => {
    sock.on('connect', resolve);
    sock.on('connect_error', reject);
  });
  const emitAck = (ev, payload) => new Promise(resolve => sock.emit(ev, payload, resolve));
  const access = await emitAck('realtime:request', {
    op: 'workspace.access.get',
    input: { workspaceId: process.env.WS_ID },
    clientVersion: '0.27.5',
  });
  const sub = await emitAck('realtime:subscribe', {
    topic: 'workspace.access.changed',
    input: { workspaceId: process.env.WS_ID },
    clientVersion: '0.27.5',
  });
  const unsub = await emitAck('realtime:unsubscribe', {
    subscriptionId: sub?.data?.subscriptionId ?? '',
    clientVersion: '0.27.5',
  });
  sock.disconnect();
  console.log(JSON.stringify({ access, sub, unsub }));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
"#;

  let parsed = run_node_socketio_script(
    script,
    &[
      ("SYNC_URL", &base_url),
      ("OUTSIDER_COOKIE", &format!("affine_session={outsider_session}")),
      ("WS_ID", &ws_id),
    ],
  )
  .await;

  let access = &parsed["access"]["data"]["access"];
  assert_eq!(access["role"], "External");
  assert_eq!(access["team"], false);

  let perms = access["permissions"].as_object().expect("permissions object");
  let mut keys: Vec<&str> = perms.keys().map(String::as_str).collect();
  keys.sort_unstable();
  assert_eq!(
    keys,
    vec![
      "Workspace_Administrators_Manage",
      "Workspace_Blobs_Manage",
      "Workspace_Blobs_Upload",
      "Workspace_Copilot",
      "Workspace_CreateDoc",
      "Workspace_Delete",
      "Workspace_Organize_Read",
      "Workspace_Payment_Manage",
      "Workspace_Preview",
      "Workspace_Properties_Create",
      "Workspace_Properties_Delete",
      "Workspace_Properties_Read",
      "Workspace_Properties_Update",
      "Workspace_Read",
      "Workspace_Settings_Read",
      "Workspace_Settings_Update",
      "Workspace_Sync",
      "Workspace_TransferOwner",
      "Workspace_Users_Manage",
      "Workspace_Users_Read",
    ]
  );
  assert_eq!(perms["Workspace_Read"], true);
  assert_eq!(perms["Workspace_Preview"], true);
  assert_eq!(perms["Workspace_Blobs_Manage"], false);
  assert_eq!(perms["Workspace_Blobs_Upload"], false);
  assert_eq!(perms["Workspace_Administrators_Manage"], false);

  assert!(
    parsed["sub"]["data"]["subscriptionId"]
      .as_str()
      .is_some_and(|s| !s.is_empty()),
    "public non-member must subscribe to workspace.access.changed: {parsed}"
  );
  assert_eq!(parsed["unsub"]["data"]["ok"], true);

  server.shutdown().await;
  http_handle.abort();
  db.pool().close().await;
  drop(db);
  drop_empty_db_off_runtime(empty).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn realtime_room_subscribe_fanout_unsubscribe_and_guards() {
  let redis = TestRedis::from_env_or_docker().expect("Redis 7");
  let empty = create_empty_db_off_runtime("realtime_rooms").await;
  let db = ServerDb::connect(DbConfig::new(&empty.url))
    .await
    .expect("connect test db");
  db.ensure_schema_ready().await.expect("ensure schema ready");
  let (_owner_id, owner_session, ws_id) = seed_user_and_workspace(&db).await;

  let (server, base_url, http_handle) = spawn_sync_server(db.clone(), redis.url()).await;

  let script = r#"
const { io } = require('socket.io-client');
const net = require('node:net');
(async () => {
  const mk = () => io(process.env.SYNC_URL, {
    path: '/socket.io/',
    transports: ['websocket'],
    extraHeaders: { Cookie: process.env.OWNER_COOKIE },
  });
  const s1 = mk();
  const s2 = mk();
  await Promise.all([s1, s2].map(s => new Promise((res, rej) => { s.on('connect', res); s.on('connect_error', rej); })));
  const emitAck = (s, ev, payload) => new Promise(res => s.emit(ev, payload, res));

  // 1. Unsupported clientVersion rejected
  const badVer = await emitAck(s1, 'realtime:subscribe', {
    topic: 'workspace.config.changed',
    input: { workspaceId: process.env.WS_ID },
    clientVersion: '0.25.0',
  });
  // 2. Unknown topic rejected
  const badTopic = await emitAck(s1, 'realtime:subscribe', {
    topic: 'unknown.topic',
    input: { workspaceId: process.env.WS_ID },
    clientVersion: '0.27.5',
  });
  // 3. Both subscribe to workspace.config.changed; duplicate subscribe on s1 returns identical subscriptionId.
  const sub1 = await emitAck(s1, 'realtime:subscribe', {
    topic: 'workspace.config.changed',
    input: { workspaceId: process.env.WS_ID },
    clientVersion: '0.27.5',
  });
  const sub1Dup = await emitAck(s1, 'realtime:subscribe', {
    topic: 'workspace.config.changed',
    input: { workspaceId: process.env.WS_ID },
    clientVersion: '0.27.5',
  });
  const sub2 = await emitAck(s2, 'realtime:subscribe', {
    topic: 'workspace.config.changed',
    input: { workspaceId: process.env.WS_ID },
    clientVersion: '0.27.5',
  });

  const events1 = [];
  const events2 = [];
  s1.on('realtime:event', e => events1.push(e));
  s2.on('realtime:event', e => events2.push(e));

  const room = `workspace:${process.env.WS_ID}:config`;
  const publishRaw = (event, payload, id) => new Promise((resolve, reject) => {
    const u = new URL(process.env.REDIS_URL);
    const chan = 'affine:eventbus:v1';
    const msg = JSON.stringify({
      v: 1,
      id,
      event,
      originId: 'external-origin',
      originChannel: 'v2:canary',
      requestId: null,
      payload,
    });
    const enc = s => `$${Buffer.byteLength(s)}\r\n${s}\r\n`;
    const sock = net.createConnection({ host: u.hostname, port: Number(u.port || 6379) }, () => {
      sock.write(`*3\r\n${enc('PUBLISH')}${enc(chan)}${enc(msg)}`);
    });
    sock.once('data', () => { sock.end(); resolve(); });
    sock.once('error', reject);
  });
  const publish = (seq) => publishRaw('realtime.topic.changed', {
    topic: 'workspace.config.changed',
    room,
    input: { workspaceId: process.env.WS_ID },
    event: { seq },
  }, `eb_rt_${seq}`);

  await publish(1);
  await new Promise(r => setTimeout(r, 250));
  const unsub1 = await emitAck(s1, 'realtime:unsubscribe', {
    subscriptionId: sub1.data.subscriptionId,
    clientVersion: '0.27.5',
  });
  await publish(2);
  await new Promise(r => setTimeout(r, 250));

  s1.disconnect();
  s2.disconnect();
  console.log(JSON.stringify({ badVer, badTopic, sub1, sub1Dup, sub2, unsub1, events1, events2 }));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
"#;

  let parsed = run_node_socketio_script(
    script,
    &[
      ("SYNC_URL", &base_url),
      ("OWNER_COOKIE", &format!("affine_session={owner_session}")),
      ("WS_ID", &ws_id),
      ("REDIS_URL", redis.url()),
    ],
  )
  .await;

  let expected_input_key = format!("{{\"workspaceId\":\"{ws_id}\"}}");
  assert_eq!(parsed["badVer"]["error"]["code"], "UNSUPPORTED_CLIENT_VERSION");
  assert_eq!(parsed["badTopic"]["error"]["code"], "BAD_REQUEST");
  assert!(parsed["sub1"]["data"]["subscriptionId"].is_string());
  assert_eq!(
    parsed["sub1"]["data"]["subscriptionId"], parsed["sub1Dup"]["data"]["subscriptionId"],
    "duplicate subscribe must return deterministic identical subscriptionId"
  );
  assert_eq!(parsed["unsub1"]["data"]["ok"], true);
  assert_eq!(parsed["events1"].as_array().unwrap().len(), 1);
  assert_eq!(parsed["events1"][0]["topic"], "workspace.config.changed");
  assert_eq!(parsed["events1"][0]["inputKey"], expected_input_key);
  assert!(parsed["events1"][0]["sentAt"].as_i64().unwrap_or(0) > 0);
  assert_eq!(parsed["events1"][0]["event"]["seq"], 1);
  assert_eq!(parsed["events2"].as_array().unwrap().len(), 2);
  assert_eq!(parsed["events2"][1]["inputKey"], expected_input_key);
  assert_eq!(parsed["events2"][1]["event"]["seq"], 2);

  // Verify permission revocation evicts realtime room subscriptions on sync.permissions.changed.
  let member_id = uuid::Uuid::new_v4().to_string();
  let member_session = uuid::Uuid::new_v4().to_string();
  sqlx::query("INSERT INTO users (id, name, email, registered, disabled) VALUES ($1, 'Revoked', 'revoked@affine.test', true, false)")
    .bind(&member_id)
    .execute(db.pool())
    .await
    .unwrap();
  sqlx::query("INSERT INTO multiple_users_sessions (id, created_at) VALUES ($1, clock_timestamp())")
    .bind(&member_session)
    .execute(db.pool())
    .await
    .unwrap();
  sqlx::query(
    "INSERT INTO user_sessions (id, session_id, user_id, expires_at, created_at)
     VALUES ($1, $2, $3, clock_timestamp() + interval '1 day', clock_timestamp())",
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&member_session)
  .bind(&member_id)
  .execute(db.pool())
  .await
  .unwrap();
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

  let evict_script = r#"
const { io } = require('socket.io-client');
const mk = (cookie) => io(process.env.SYNC_URL, {
  path: '/socket.io/',
  transports: ['websocket'],
  extraHeaders: { Cookie: cookie },
});
const bob = mk(process.env.MEMBER_COOKIE);
const alice = mk(process.env.OWNER_COOKIE);
const bobEvents = [];
const aliceEvents = [];
bob.on('realtime:event', e => bobEvents.push(e));
alice.on('realtime:event', e => {
  aliceEvents.push(e);
  if (e?.event?.seq === 99) {
    bob.emit('realtime:unsubscribe', { clientVersion: '0.27.5' }, () => {
      console.log(JSON.stringify({ bobEvents, aliceEvents }));
      bob.disconnect();
      alice.disconnect();
      process.exit(0);
    });
  }
});
let ready = 0;
const onSub = (sub) => {
  if (!sub?.data?.subscriptionId) process.exit(2);
  ready += 1;
  if (ready === 2) console.log('SUBSCRIBED');
};
bob.on('connect', () => {
  bob.emit('realtime:subscribe', {
    topic: 'workspace.config.changed',
    input: { workspaceId: process.env.WS_ID },
    clientVersion: '0.27.5',
  }, onSub);
});
alice.on('connect', () => {
  alice.emit('realtime:subscribe', {
    topic: 'workspace.config.changed',
    input: { workspaceId: process.env.WS_ID },
    clientVersion: '0.27.5',
  }, onSub);
});
"#;
  let node_root = locate_node_modules_root();
  let mut child = Command::new("node")
    .arg("--input-type=commonjs")
    .arg("-e")
    .arg(evict_script)
    .env("NODE_PATH", node_root.join("node_modules"))
    .env("SYNC_URL", &base_url)
    .env("MEMBER_COOKIE", format!("affine_session={member_session}"))
    .env("OWNER_COOKIE", format!("affine_session={owner_session}"))
    .env("WS_ID", &ws_id)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .expect("spawn realtime eviction node");
  let mut stdout_reader = tokio::io::BufReader::new(child.stdout.take().unwrap());
  let mut ready_line = String::new();
  tokio::io::AsyncBufReadExt::read_line(&mut stdout_reader, &mut ready_line)
    .await
    .expect("read SUBSCRIBED");
  assert_eq!(ready_line.trim(), "SUBSCRIBED");

  // Remove member from workspace and publish sync.permissions.changed, then publish sentinel seq:99.
  // Because Redis pubsub delivers in FIFO order on the same channel, waiting for the positive-control
  // Owner client (Alice) to receive seq:99 deterministically guarantees sync.permissions.changed was
  // processed without any fixed sleep.
  sqlx::query("DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2")
    .bind(&ws_id)
    .bind(&member_id)
    .execute(db.pool())
    .await
    .unwrap();
  let redis_client = redis::Client::open(redis.url()).unwrap();
  let mut redis_conn = redis_client.get_multiplexed_async_connection().await.unwrap();
  let perm_msg = json!({
    "v": 1,
    "id": "eb_rt_perm_evict_1",
    "event": "sync.permissions.changed",
    "originId": "external-origin",
    "originChannel": "v2:canary",
    "requestId": null,
    "payload": {
      "spaceType": "workspace",
      "spaceId": ws_id,
    }
  })
  .to_string();
  let _: () = redis_conn.publish(EVENTBUS_CHANNEL_V1, &perm_msg).await.unwrap();

  let after_evict_msg = json!({
    "v": 1,
    "id": "eb_rt_after_evict_1",
    "event": "realtime.topic.changed",
    "originId": "external-origin",
    "originChannel": "v2:canary",
    "requestId": null,
    "payload": {
      "topic": "workspace.config.changed",
      "room": format!("workspace:{ws_id}:config"),
      "input": { "workspaceId": ws_id },
      "event": { "seq": 99 }
    }
  })
  .to_string();
  let _: () = redis_conn.publish(EVENTBUS_CHANNEL_V1, &after_evict_msg).await.unwrap();

  let mut out_line = String::new();
  tokio::time::timeout(
    Duration::from_secs(10),
    tokio::io::AsyncBufReadExt::read_line(&mut stdout_reader, &mut out_line),
  )
  .await
  .expect("timed out waiting for positive-control sentinel event")
  .expect("read eviction json");
  let status = child.wait().await.unwrap();
  assert!(status.success(), "eviction node script failed");
  let evict_json: Value = serde_json::from_str(out_line.trim()).unwrap();
  assert_eq!(
    evict_json["aliceEvents"].as_array().unwrap().len(),
    1,
    "positive-control owner must receive sentinel seq:99 event: {evict_json}"
  );
  assert_eq!(
    evict_json["bobEvents"].as_array().unwrap().len(),
    0,
    "evicted member must not receive realtime:event after sync.permissions.changed: {evict_json}"
  );

  server.shutdown().await;
  http_handle.abort();
  db.pool().close().await;
  drop(db);
  drop_empty_db_off_runtime(empty).await;
}
