//! PostgreSQL 16 integration tests for multipart blob upload, HMAC proxy token
//! verification, `max_connections = 1` deadlock freedom, `ArcSwap` dynamic
//! storage hot reload, expired reservation cleanup, and orphan reconciliation.

use std::path::PathBuf;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use server_blob::{
  BlobService, BlobStorageBackend, LocalFsBlobStorage, ObjectMetadata, StorageError, UploadInitMethod, UploadedPart,
};
use server_db::{DbConfig, ServerDb};
use server_spi::QuotaGate;
use server_types::{AccessGrant, DomainError, ServerRole};
use sqlx::{Postgres, Transaction};
use test_db_harness::{
  migrations::MigrationSet,
  pg::{DEFAULT_LEASE_TTL, DbLease, PgCluster},
};

struct GenerousQuotaGate;

#[async_trait::async_trait]
impl QuotaGate for GenerousQuotaGate {
  async fn resolve_workspace_grant(
    &self,
    _tx: &mut Transaction<'_, Postgres>,
    _workspace_id: &str,
    _now: DateTime<Utc>,
  ) -> Result<AccessGrant, DomainError> {
    let mut grant = server_types::license::default_selfhost_access_grant();
    grant.limits.blob_limit_bytes = 50 * 1024 * 1024;
    grant.limits.storage_quota_bytes = 100 * 1024 * 1024;
    grant.limits.seat_limit = 10;
    Ok(grant)
  }

  async fn check_seat_admission(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    _current_active_seats: i32,
    _adding_seats: i32,
    now: DateTime<Utc>,
  ) -> Result<AccessGrant, DomainError> {
    self.resolve_workspace_grant(tx, workspace_id, now).await
  }
}

fn leased_0275_database() -> DbLease {
  let cluster = PgCluster::from_env_or_docker().expect("test PG16 cluster");
  let migrations = MigrationSet::load(&PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations"))
    .expect("load v0.27.5 migrations");
  let template = cluster.ensure_template(&migrations).expect("v0.27.5 template");
  cluster
    .lease(&template, DEFAULT_LEASE_TTL)
    .expect("lease test database")
}

async fn connect_db(url: &str, max_connections: u32) -> ServerDb {
  let db = ServerDb::connect(DbConfig {
    database_url: url.to_owned(),
    channel: "canary".into(),
    role: ServerRole::Allinone,
    selfhosted: true,
    max_connections,
    statement_timeout_ms: 5_000,
    tier_permits: [4, 2, 2, 1],
  })
  .await
  .expect("connect db");
  sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    .execute(db.pool())
    .await
    .expect("reset schema for fresh ensure_schema_ready");
  db.ensure_schema_ready().await.expect("ensure schema ready");
  db
}

async fn seed_workspace(db: &ServerDb, workspace_id: &str) {
  sqlx::query("INSERT INTO workspaces (id, name) VALUES ($1, 'Test WS') ON CONFLICT DO NOTHING")
    .bind(workspace_id)
    .execute(db.pool())
    .await
    .expect("insert workspace");
}

struct BlockingPutBackend {
  inner: LocalFsBlobStorage,
  entered_tx: tokio::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
  release_rx: tokio::sync::Mutex<Option<tokio::sync::oneshot::Receiver<()>>>,
}

#[async_trait::async_trait]
impl BlobStorageBackend for BlockingPutBackend {
  async fn put(&self, key: &str, body: Vec<u8>, content_type: &str) -> Result<ObjectMetadata, StorageError> {
    if let Some(tx) = self.entered_tx.lock().await.take() {
      let _ = tx.send(());
    }
    if let Some(rx) = self.release_rx.lock().await.take() {
      let _ = rx.await;
    }
    self.inner.put(key, body, content_type).await
  }

  async fn get(&self, key: &str) -> Result<Option<(Vec<u8>, ObjectMetadata)>, StorageError> {
    self.inner.get(key).await
  }

  async fn head(&self, key: &str) -> Result<Option<ObjectMetadata>, StorageError> {
    self.inner.head(key).await
  }

  async fn delete(&self, key: &str) -> Result<(), StorageError> {
    self.inner.delete(key).await
  }
}

#[test]
fn multipart_upload_lifecycle_tamper_rejection_and_single_conn_pool_deadlock_freedom() {
  let lease = leased_0275_database();
  let db_url = lease.url().to_owned();
  let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    // Strictly test with max_connections = 1 to prove zero PG pool deadlock during storage I/O.
    let db = connect_db(&db_url, 1).await;
    seed_workspace(&db, "ws-mp").await;

    let tmp_dir = std::env::temp_dir().join(format!("affine-mp-test-{}", uuid::Uuid::new_v4()));
    let fs = LocalFsBlobStorage::new(tmp_dir.to_str().unwrap(), "blobs")
      .unwrap()
      .with_proxy_upload("proxy-hmac-secret-key", None);
    let svc = BlobService::new(db.clone(), Arc::new(fs), Arc::new(GenerousQuotaGate));

    let part_size = 1024;
    let threshold = 1500;
    let payload_part1 = vec![b'A'; 1024];
    let payload_part2 = vec![b'B'; 600];
    let total_size = (payload_part1.len() + payload_part2.len()) as i64;

    // 1. Initialize multipart upload.
    let init = svc
      .init_blob_upload(
        "ws-mp",
        "big.bin",
        total_size,
        "application/octet-stream",
        "http://localhost:3010",
        threshold,
        part_size,
      )
      .await
      .expect("init multipart");
    assert!(!init.already_uploaded);
    assert_eq!(init.method, UploadInitMethod::Multipart);
    let upload_id = init.upload_id.expect("upload_id");

    // 2. Fetch signed proxy part URLs and parse query params.
    let p1_plan = svc
      .get_blob_upload_part_url("ws-mp", "big.bin", &upload_id, 1, "http://localhost:3010", part_size)
      .await
      .expect("part 1 url");
    let p1_url = url::Url::parse(&p1_plan.upload_url).unwrap();
    let p1_params: std::collections::HashMap<String, String> = p1_url.query_pairs().into_owned().collect();
    let p1_expires: i64 = p1_params["expiresAt"].parse().unwrap();
    let p1_token = p1_params["token"].clone();

    // Verify cross-gen v0.27.5 HMAC token format (URL_SAFE_NO_PAD of canonical JSON array).
    assert!(server_blob::verify_proxy_upload_token(
      "proxy-hmac-secret-key",
      server_blob::PROXY_MULTIPART_PATH,
      &[
        serde_json::json!("ws-mp"),
        serde_json::json!("big.bin"),
        serde_json::json!(&upload_id),
        serde_json::json!(1),
        serde_json::json!(1024),
      ],
      p1_expires,
      &p1_token,
    ));

    // Tampered token must be rejected during pre-auth (before reading any body).
    let tamper_err = svc
      .verify_proxy_multipart_request(
        "ws-mp",
        "big.bin",
        &upload_id,
        1,
        1024,
        p1_expires,
        "0000deadbeef",
        part_size,
      )
      .await
      .err()
      .expect("tampered token rejected");
    assert!(matches!(tamper_err, DomainError::Validation(_)));

    // Expired timestamp must be rejected during pre-auth.
    let expired_err = svc
      .verify_proxy_multipart_request("ws-mp", "big.bin", &upload_id, 1, 1024, 1, &p1_token, part_size)
      .await
      .err()
      .expect("expired token rejected");
    assert!(matches!(expired_err, DomainError::Validation(_)));

    // Valid part 1 upload.
    let v1 = svc
      .verify_proxy_multipart_request(
        "ws-mp", "big.bin", &upload_id, 1, 1024, p1_expires, &p1_token, part_size,
      )
      .await
      .expect("verify part 1");
    let etag1 = svc
      .write_proxy_multipart_part(v1, payload_part1.clone())
      .await
      .expect("upload part 1");

    // Valid part 2 upload.
    let p2_plan = svc
      .get_blob_upload_part_url("ws-mp", "big.bin", &upload_id, 2, "http://localhost:3010", part_size)
      .await
      .expect("part 2 url");
    let p2_url = url::Url::parse(&p2_plan.upload_url).unwrap();
    let p2_params: std::collections::HashMap<String, String> = p2_url.query_pairs().into_owned().collect();
    let v2 = svc
      .verify_proxy_multipart_request(
        "ws-mp",
        "big.bin",
        &upload_id,
        2,
        600,
        p2_params["expiresAt"].parse().unwrap(),
        &p2_params["token"],
        part_size,
      )
      .await
      .expect("verify part 2");
    let etag2 = svc
      .write_proxy_multipart_part(v2, payload_part2.clone())
      .await
      .expect("upload part 2");

    // 3. Reject duplicate part numbers, then complete with out-of-order [part 2, part 1] and verify merged content.
    let dup_err = svc
      .complete_blob_upload(
        "ws-mp",
        "big.bin",
        Some(&upload_id),
        Some(&[
          UploadedPart {
            part_number: 1,
            etag: etag1.clone(),
          },
          UploadedPart {
            part_number: 1,
            etag: etag1.clone(),
          },
        ]),
      )
      .await
      .expect_err("duplicate part numbers must be rejected");
    assert!(matches!(dup_err, DomainError::Validation(_)));

    let done_key = svc
      .complete_blob_upload(
        "ws-mp",
        "big.bin",
        Some(&upload_id),
        Some(&[
          UploadedPart {
            part_number: 2,
            etag: etag2,
          },
          UploadedPart {
            part_number: 1,
            etag: etag1,
          },
        ]),
      )
      .await
      .expect("complete multipart out-of-order");
    assert_eq!(done_key, "big.bin");

    // 3b. Stale reservation_id from replaced generation cannot write to old reservation path.
    let gen1_plan = svc
      .init_blob_upload(
        "ws-mp",
        "gen.bin",
        5,
        "text/plain",
        "http://localhost:3010",
        threshold,
        part_size,
      )
      .await
      .expect("init gen1");
    let gen1_url = url::Url::parse(gen1_plan.upload_url.as_deref().unwrap()).unwrap();
    let gen1_q: std::collections::HashMap<String, String> = gen1_url.query_pairs().into_owned().collect();
    let gen1_res_id: String =
      sqlx::query_scalar("SELECT reservation_id::text FROM blobs WHERE workspace_id='ws-mp' AND key='gen.bin'")
        .fetch_one(db.pool())
        .await
        .unwrap();
    let verified_gen1 = svc
      .verify_proxy_upload_request(
        "ws-mp",
        "gen.bin",
        "text/plain",
        5,
        gen1_q["expiresAt"].parse().unwrap(),
        &gen1_q["token"],
      )
      .await
      .expect("verify gen1");
    sqlx::query("DELETE FROM blobs WHERE workspace_id='ws-mp' AND key='gen.bin'")
      .execute(db.pool())
      .await
      .unwrap();
    let _gen2_plan = svc
      .init_blob_upload(
        "ws-mp",
        "gen.bin",
        5,
        "text/plain",
        "http://localhost:3010",
        threshold,
        part_size,
      )
      .await
      .expect("init gen2");
    let stale_err = svc
      .write_proxy_upload_object(verified_gen1, b"stale".to_vec())
      .await
      .expect_err("stale gen1 write must be rejected");
    assert!(matches!(stale_err, DomainError::Validation(_)));
    assert!(
      !tmp_dir
        .join("blobs/ws-mp/.reservations")
        .join(&gen1_res_id)
        .join("gen.bin")
        .exists(),
      "stale gen1 object must not be written"
    );

    let (record, bytes) = svc
      .get_blob("ws-mp", "big.bin")
      .await
      .expect("get blob")
      .expect("blob exists");
    assert_eq!(record.size, total_size);
    let mut expected = payload_part1;
    expected.extend_from_slice(&payload_part2);
    assert_eq!(bytes, expected);

    // 4. Abort flow removes pending reservation.
    let abort_init = svc
      .init_blob_upload(
        "ws-mp",
        "abort.bin",
        2048,
        "application/octet-stream",
        "http://localhost:3010",
        threshold,
        part_size,
      )
      .await
      .expect("init abortable");
    let abort_uid = abort_init.upload_id.expect("abort upload_id");
    assert!(svc.abort_blob_upload("ws-mp", "abort.bin", &abort_uid).await.unwrap());
    assert!(svc.get_blob("ws-mp", "abort.bin").await.unwrap().is_none());

    // 5. Mock S3 complete_multipart_upload sorts [2, 1] -> [1, 2] and rejects duplicate [1, 1].
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let seen_body = Arc::new(tokio::sync::Mutex::new(String::new()));
    let seen_body_srv = Arc::clone(&seen_body);
    let srv = tokio::spawn(async move {
      use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
      for _ in 0..2 {
        let Ok((mut sock, _)) = listener.accept().await else {
          break;
        };
        let mut buf = vec![0u8; 8192];
        let n = sock.read(&mut buf).await.unwrap_or(0);
        let req = String::from_utf8_lossy(&buf[..n]).into_owned();
        if req.starts_with("POST ") {
          if let Some((_, body)) = req.split_once("\r\n\r\n") {
            *seen_body_srv.lock().await = body.to_owned();
          }
          let xml = "<CompleteMultipartUploadResult><ETag>\"ok\"</ETag></CompleteMultipartUploadResult>";
          let resp = format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\n\r\n{xml}", xml.len());
          let _ = sock.write_all(resp.as_bytes()).await;
        } else {
          let resp = "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: 10\r\n\r\n";
          let _ = sock.write_all(resp.as_bytes()).await;
        }
      }
    });
    let s3 = server_blob::S3BlobStorage::new(server_blob::S3Config {
      endpoint: Some(format!("http://{addr}")),
      region: "us-east-1".into(),
      bucket: "blobs".into(),
      access_key_id: "ak".into(),
      secret_access_key: "sk".into(),
      session_token: None,
      force_path_style: true,
      request_timeout: None,
    })
    .unwrap();
    assert!(
      s3.complete_multipart_upload(
        "ws-mp/s3.bin",
        "uid-1",
        &[
          UploadedPart {
            part_number: 1,
            etag: "\"e1\"".into()
          },
          UploadedPart {
            part_number: 1,
            etag: "\"e1\"".into()
          },
        ],
      )
      .await
      .is_err()
    );
    let meta = s3
      .complete_multipart_upload(
        "ws-mp/s3.bin",
        "uid-1",
        &[
          UploadedPart {
            part_number: 2,
            etag: "\"e2\"".into(),
          },
          UploadedPart {
            part_number: 1,
            etag: "\"e1\"".into(),
          },
        ],
      )
      .await
      .expect("s3 out-of-order complete");
    assert_eq!(meta.content_length, 10);
    let xml_sent = seen_body.lock().await.clone();
    assert!(
      xml_sent.find("<PartNumber>1</PartNumber>").unwrap() < xml_sent.find("<PartNumber>2</PartNumber>").unwrap(),
      "S3 XML must be sorted by part_number: {xml_sent}"
    );
    let _ = srv.await;

    let _ = std::fs::remove_dir_all(&tmp_dir);
    db.pool().close().await;
  });
}

#[test]
fn dynamic_storage_reload_protects_active_multipart_and_preserves_in_flight_writes() {
  let lease = leased_0275_database();
  let db_url = lease.url().to_owned();
  let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    let db = connect_db(&db_url, 2).await;
    seed_workspace(&db, "ws-reload").await;

    let root1 = std::env::temp_dir().join(format!("affine-reload-1-{}", uuid::Uuid::new_v4()));
    let root2 = std::env::temp_dir().join(format!("affine-reload-2-{}", uuid::Uuid::new_v4()));
    let fs1 = LocalFsBlobStorage::new(root1.to_str().unwrap(), "blobs")
      .unwrap()
      .with_proxy_upload("secret-1", None);
    let fs2 = LocalFsBlobStorage::new(root2.to_str().unwrap(), "blobs")
      .unwrap()
      .with_proxy_upload("secret-2", None);

    // 1. In-flight write continues uninterrupted when ArcSwap swaps backend.
    let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
    let (release_tx, release_rx) = tokio::sync::oneshot::channel();
    let blocking_backend = Arc::new(BlockingPutBackend {
      inner: fs1.clone(),
      entered_tx: tokio::sync::Mutex::new(Some(entered_tx)),
      release_rx: tokio::sync::Mutex::new(Some(release_rx)),
    });
    let svc = Arc::new(BlobService::new(
      db.clone(),
      blocking_backend,
      Arc::new(GenerousQuotaGate),
    ));

    let svc_writer = Arc::clone(&svc);
    let write_task = tokio::spawn(async move {
      svc_writer
        .put_blob("ws-reload", "inflight.txt", "text/plain", b"hello-inflight".to_vec())
        .await
    });
    entered_rx.await.expect("writer entered storage put");

    // Swap to fs2 while writer is in flight (no active multipart).
    sqlx::query(
      "INSERT INTO app_configs (id, value, created_at, updated_at) VALUES ('storages.blob.storage', $1, now(), now()) \
       ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
    )
    .bind(serde_json::json!({ "provider": "fs", "bucket": "blobs", "config": { "path": root2.to_str().unwrap() } }))
    .execute(db.pool())
    .await
    .unwrap();
    svc
      .reload_storage_backend(Arc::new(fs2.clone()))
      .await
      .expect("swap to fs2");
    let _ = release_tx.send(());
    write_task
      .await
      .expect("join write")
      .expect("in-flight write succeeded on original backend");
    assert!(fs1.head("ws-reload/inflight.txt").await.unwrap().is_some());

    // 2. Active multipart upload blocks incompatible backend switch.
    let init = svc
      .init_blob_upload(
        "ws-reload",
        "active-mp.bin",
        4096,
        "application/octet-stream",
        "http://localhost:3010",
        1024,
        1024,
      )
      .await
      .expect("start multipart");
    let upload_id = init.upload_id.expect("upload_id");

    let conflict = svc.reload_storage_backend(Arc::new(fs1.clone())).await.unwrap_err();
    assert!(matches!(conflict, DomainError::Conflict(_)));

    // After aborting multipart upload, switching backend succeeds.
    assert!(
      svc
        .abort_blob_upload("ws-reload", "active-mp.bin", &upload_id)
        .await
        .unwrap()
    );
    svc
      .reload_storage_backend(Arc::new(fs1))
      .await
      .expect("reload succeeds after multipart drained");

    let _ = std::fs::remove_dir_all(&root1);
    let _ = std::fs::remove_dir_all(&root2);
    db.pool().close().await;
  });
}

#[test]
fn expired_reservation_cleanup_and_orphan_reconciliation_are_idempotent() {
  let lease = leased_0275_database();
  let db_url = lease.url().to_owned();
  let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    let db = connect_db(&db_url, 2).await;
    seed_workspace(&db, "ws-live").await;

    let root = std::env::temp_dir().join(format!("affine-reconcile-{}", uuid::Uuid::new_v4()));
    let fs = Arc::new(LocalFsBlobStorage::new(root.to_str().unwrap(), "blobs").unwrap());
    let svc = BlobService::new(db.clone(), fs.clone(), Arc::new(GenerousQuotaGate));

    // Insert an expired pending blob reservation AND two comment_attachments with same (workspace_id, key)
    // on different doc_ids: doc-1 is expired, doc-2 is live (3-column PK must preserve doc-2).
    sqlx::query(
      "INSERT INTO blobs (workspace_id, key, size, mime, status, reservation_id, reservation_expires_at) \
       VALUES ('ws-live', 'stale.bin', 128, 'application/octet-stream', 'pending', gen_random_uuid(), \
               clock_timestamp() - interval '10 minutes')",
    )
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO comment_attachments (workspace_id, doc_id, key, name, size, mime, status, reservation_id, reservation_expires_at) \
       VALUES ('ws-live', 'doc-1', 'shared.png', 'a.png', 10, 'image/png', 'pending', gen_random_uuid(), clock_timestamp() - interval '10 minutes'), \
              ('ws-live', 'doc-2', 'shared.png', 'a.png', 10, 'image/png', 'pending', gen_random_uuid(), clock_timestamp() + interval '10 minutes')",
    )
    .execute(db.pool())
    .await
    .unwrap();

    // 4-row table-driven orphan reconciliation cases:
    // 1. Unknown prefix (>24h old) -> skipped, NOT deleted
    // 2. Live comment-attachments/ws-live/doc-1/att.png (>24h old) -> NOT deleted
    // 3. Within-24h grace orphan ws-deleted/fresh-orphan.bin -> skipped, NOT deleted
    // 4. >24h real orphan ws-deleted/old-orphan.bin -> DELETED
    fs.put("ws-live/keep.bin", b"keep".to_vec(), "application/octet-stream").await.unwrap();
    fs.put("tmp/unknown.bin", b"u".to_vec(), "application/octet-stream").await.unwrap();
    fs.put("comment-attachments/ws-live/doc-1/att.png", b"att".to_vec(), "image/png").await.unwrap();
    fs.put("ws-deleted/fresh-orphan.bin", b"fresh".to_vec(), "application/octet-stream").await.unwrap();
    fs.put("ws-deleted/old-orphan.bin", b"old".to_vec(), "application/octet-stream").await.unwrap();

    let old_time = std::time::SystemTime::now() - std::time::Duration::from_secs(25 * 3600);
    for rel in ["tmp/unknown.bin", "comment-attachments/ws-live/doc-1/att.png", "ws-deleted/old-orphan.bin"] {
      let full = fs.bucket_dir().join(rel);
      std::fs::OpenOptions::new().write(true).open(&full).unwrap().set_modified(old_time).unwrap();
    }

    let cleanup = svc.cleanup_expired_reservations(1000, &|| false).await.unwrap();
    assert_eq!(cleanup.deleted_blobs, 1);
    assert_eq!(cleanup.deleted_comment_attachments, 1);
    let doc2_still_exists: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM comment_attachments WHERE workspace_id='ws-live' AND doc_id='doc-2' AND key='shared.png')",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert!(doc2_still_exists, "3-col PK cleanup must not delete doc-2 reservation");
    let cleanup2 = svc.cleanup_expired_reservations(1000, &|| false).await.unwrap();
    assert_eq!(cleanup2.deleted_blobs, 0);
    assert_eq!(cleanup2.deleted_comment_attachments, 0);

    let rec = svc.reconcile_storage_orphans(100, &|| false).await.unwrap();
    assert!(rec.leased);
    assert!(rec.completed);
    assert_eq!(rec.deleted_objects, 1);
    assert_eq!(rec.skipped_unknown_prefix, 1);
    assert_eq!(rec.skipped_within_grace, 1);
    assert!(fs.head("ws-live/keep.bin").await.unwrap().is_some());
    assert!(fs.head("tmp/unknown.bin").await.unwrap().is_some());
    assert!(fs.head("comment-attachments/ws-live/doc-1/att.png").await.unwrap().is_some());
    assert!(fs.head("ws-deleted/fresh-orphan.bin").await.unwrap().is_some());
    assert!(fs.head("ws-deleted/old-orphan.bin").await.unwrap().is_none());

    // Second run is idempotent.
    let rec2 = svc.reconcile_storage_orphans(100, &|| false).await.unwrap();
    assert!(rec2.leased);
    assert_eq!(rec2.deleted_objects, 0);

    // Copilot & artifact prefixes older than 24h must be skipped and never deleted.
    let exempt_keys = [
      "copilot-attachments/ws-deleted/u-1/k1",
      "copilot/artifacts/ws-deleted/a1",
      "copilot/transcript/ws-deleted/t1",
      "artifacts/ws-deleted/a2",
    ];
    for key in exempt_keys {
      fs.put(key, b"keep-exempt".to_vec(), "application/octet-stream").await.unwrap();
      let full = fs.bucket_dir().join(key);
      std::fs::OpenOptions::new()
        .write(true)
        .open(&full)
        .unwrap()
        .set_modified(old_time)
        .unwrap();
    }
    let rec_exempt = svc.reconcile_storage_orphans(100, &|| false).await.unwrap();
    assert!(rec_exempt.leased);
    assert_eq!(rec_exempt.deleted_objects, 0);
    for key in exempt_keys {
      assert!(
        fs.head(key).await.unwrap().is_some(),
        "exempt prefix object older than 24h must not be deleted: {key}"
      );
    }

    // 5. Verify createBlobUpload (GRAPHQL) -> put_blob succeeds without self-block,
    //    retry returns already_uploaded == true, and size mismatch returns blob_invalid.
    let init_gql = svc
      .init_blob_upload("ws-live", "gql-reuse.txt", 5, "text/plain", "http://localhost:3010", 1024, 1024)
      .await
      .unwrap();
    assert!(!init_gql.already_uploaded);
    assert_eq!(init_gql.method, UploadInitMethod::Graphql);
    svc.put_blob("ws-live", "gql-reuse.txt", "text/plain", b"hello".to_vec()).await.unwrap();
    let retry = svc
      .init_blob_upload("ws-live", "gql-reuse.txt", 5, "text/plain", "http://localhost:3010", 1024, 1024)
      .await
      .unwrap();
    assert!(retry.already_uploaded);
    let mismatch = svc
      .init_blob_upload("ws-live", "gql-reuse.txt", 6, "text/plain", "http://localhost:3010", 1024, 1024)
      .await
      .unwrap_err();
    assert!(matches!(mismatch, DomainError::Validation(ref m) if m.starts_with("blob_invalid:")));
    let completed_count: i64 = sqlx::query_scalar(
      "SELECT COUNT(*)::bigint FROM blobs WHERE workspace_id='ws-live' AND key='gql-reuse.txt' AND status='completed'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(completed_count, 1);

    let _ = std::fs::remove_dir_all(&root);
    db.pool().close().await;
  });
}

struct FailingDirectBackend {
  inner: LocalFsBlobStorage,
  fail_multipart: std::sync::atomic::AtomicBool,
  fail_presign: std::sync::atomic::AtomicBool,
  presign_calls: Arc<std::sync::atomic::AtomicUsize>,
}

#[async_trait::async_trait]
impl BlobStorageBackend for FailingDirectBackend {
  async fn put(
    &self,
    key: &str,
    body: Vec<u8>,
    content_type: &str,
  ) -> Result<server_blob::ObjectMetadata, server_blob::StorageError> {
    self.inner.put(key, body, content_type).await
  }
  async fn get(&self, key: &str) -> Result<Option<(Vec<u8>, server_blob::ObjectMetadata)>, server_blob::StorageError> {
    self.inner.get(key).await
  }
  async fn head(&self, key: &str) -> Result<Option<server_blob::ObjectMetadata>, server_blob::StorageError> {
    self.inner.head(key).await
  }
  async fn delete(&self, key: &str) -> Result<(), server_blob::StorageError> {
    self.inner.delete(key).await
  }
  fn capabilities(&self) -> server_blob::StorageCapabilities {
    server_blob::StorageCapabilities {
      presign_put: true,
      multipart_direct: true,
      proxy_upload: false,
    }
  }
  async fn create_multipart_upload(
    &self,
    _key: &str,
    _content_type: &str,
  ) -> Result<Option<server_blob::MultipartUploadInit>, server_blob::StorageError> {
    if self.fail_multipart.load(std::sync::atomic::Ordering::SeqCst) {
      return Err(server_blob::StorageError::Metadata(
        "simulated multipart init failure".into(),
      ));
    }
    Ok(None)
  }
  async fn presign_put(
    &self,
    _key: &str,
    _content_type: &str,
    _content_length: i64,
  ) -> Result<Option<server_blob::PresignedUpload>, server_blob::StorageError> {
    self.presign_calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    if self.fail_presign.load(std::sync::atomic::Ordering::SeqCst) {
      return Err(server_blob::StorageError::Metadata(
        "simulated presign_put failure".into(),
      ));
    }
    Ok(None)
  }
  fn backend_identity(&self) -> server_blob::StorageBackendIdentity {
    self.inner.backend_identity()
  }
}

#[test]
fn direct_upload_init_errors_fallback_to_graphql_and_clear_pending_reservation() {
  let rt = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .unwrap();
  let lease = leased_0275_database();
  let root = std::env::temp_dir().join(format!("affine-fb-test-{}", uuid::Uuid::new_v4().simple()));
  std::fs::create_dir_all(&root).unwrap();

  rt.block_on(async {
    let db = connect_db(lease.url(), 4).await;
    seed_workspace(&db, "ws-fb").await;

    let presign_calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let backend = Arc::new(FailingDirectBackend {
      inner: LocalFsBlobStorage::new(root.to_str().unwrap(), "blobs").unwrap(),
      fail_multipart: std::sync::atomic::AtomicBool::new(true),
      fail_presign: std::sync::atomic::AtomicBool::new(false),
      presign_calls: Arc::clone(&presign_calls),
    });
    let svc = BlobService::new(db.clone(), backend.clone(), Arc::new(GenerousQuotaGate));

    // 1. create_multipart_upload returns Err -> immediately falls back to GraphQL, never calls presign_put.
    let plan1 = svc
      .init_blob_upload(
        "ws-fb",
        "mp-fail.bin",
        2048,
        "application/octet-stream",
        "http://localhost:3010",
        1024,
        1024,
      )
      .await
      .expect("multipart error must fallback to graphql");
    assert_eq!(plan1.method, UploadInitMethod::Graphql);
    assert!(!plan1.already_uploaded);
    assert_eq!(
      presign_calls.load(std::sync::atomic::Ordering::SeqCst),
      0,
      "presign_put must not be called when create_multipart_upload errors"
    );
    svc
      .put_blob(
        "ws-fb",
        "mp-fail.bin",
        "application/octet-stream",
        b"fallback-mp".to_vec(),
      )
      .await
      .expect("subsequent setBlob/put_blob must not be blocked by stale pending row");
    let (_, got1) = svc.get_blob("ws-fb", "mp-fail.bin").await.unwrap().unwrap();
    assert_eq!(got1, b"fallback-mp");

    // 2. presign_put returns Err -> falls back to GraphQL and clears pending row so setBlob succeeds.
    backend.fail_multipart.store(false, std::sync::atomic::Ordering::SeqCst);
    backend.fail_presign.store(true, std::sync::atomic::Ordering::SeqCst);
    let plan2 = svc
      .init_blob_upload(
        "ws-fb",
        "presign-fail.bin",
        512,
        "text/plain",
        "http://localhost:3010",
        1024,
        1024,
      )
      .await
      .expect("presign_put error must fallback to graphql");
    assert_eq!(plan2.method, UploadInitMethod::Graphql);
    assert_eq!(presign_calls.load(std::sync::atomic::Ordering::SeqCst), 1);
    svc
      .put_blob("ws-fb", "presign-fail.bin", "text/plain", b"fallback-presign".to_vec())
      .await
      .expect("subsequent setBlob/put_blob must succeed after presign_put fallback");
    let (_, got2) = svc.get_blob("ws-fb", "presign-fail.bin").await.unwrap().unwrap();
    assert_eq!(got2, b"fallback-presign");

    let _ = std::fs::remove_dir_all(&root);
    db.pool().close().await;
  });
}

#[test]
fn assetpack_rejects_oversized_recipe_without_panicking() {
  let rt = tokio::runtime::Builder::new_current_thread()
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    let root = std::env::temp_dir().join(format!("affine-ap-oom-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let ap = server_blob::AssetpackBlobStorage::new(root.to_str().unwrap(), "blobs", "blob").unwrap();
    // Seed a valid object first to initialize assetpack.sqlite schema.
    ap.put("ws/ok.bin", b"ok".to_vec(), "application/octet-stream")
      .await
      .expect("seed ok");

    // Craft a malicious recipe claiming original_file_size = u64::MAX.
    let fake_chunk_hash = assetpack_core::Hash32::sha3_256(b"x");
    let bad_recipe = assetpack_core::build_recipe(u64::MAX, &[(fake_chunk_hash, 1)], fake_chunk_hash, 0, 0);
    let rhash = assetpack_core::Hash32::sha3_256(&bad_recipe);
    let pool = sqlx::SqlitePool::connect(&format!("sqlite://{}", root.join("blobs/assetpack.sqlite").display()))
      .await
      .expect("open sqlite");
    let mut tx = pool.begin().await.expect("tx");
    sqlx::query(
      "INSERT OR REPLACE INTO objects (hash, kind, size, stored_size, codec, content, created_at) \
       VALUES (?1, 2, ?2, ?2, 'raw', ?3, 0)",
    )
    .bind(rhash.as_bytes().as_ref())
    .bind(bad_recipe.len() as i64)
    .bind(&bad_recipe)
    .execute(&mut *tx)
    .await
    .expect("put bad recipe");
    sqlx::query(
      "INSERT INTO storage_assetpack_blobs (scope, key, recipe_hash, content_type, content_length, checksum_crc32, last_modified_ms) \
       VALUES ('blob', 'ws/bomb.bin', ?1, 'application/octet-stream', 1, NULL, 0)",
    )
    .bind(rhash.to_hex())
    .execute(&mut *tx)
    .await
    .expect("insert manifest");
    tx.commit().await.expect("commit");
    pool.close().await;

    let err = ap
      .get("ws/bomb.bin")
      .await
      .expect_err("oversized recipe must return Err without panicking");
    assert!(
      err.to_string().contains("exceeds max"),
      "expected max size error, got: {err}"
    );
    let _ = std::fs::remove_dir_all(&root);
  });
}

#[test]
fn assetpack_blocks_zstd_bomb_and_malformed_precomp2_without_panicking() {
  let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    let root = std::env::temp_dir().join(format!("affine-ap-bomb-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let ap = server_blob::AssetpackBlobStorage::new(root.to_str().unwrap(), "blobs", "blob").unwrap();
    ap.put("ws/seed.bin", b"ok".to_vec(), "application/octet-stream")
      .await
      .expect("seed");

    let pool = sqlx::SqlitePool::connect(&format!("sqlite://{}", root.join("blobs/assetpack.sqlite").display()))
      .await
      .expect("open sqlite");

    async fn seed_crafted(
      pool: &sqlx::SqlitePool,
      key: &str,
      transform_id: u16,
      transform_version: u16,
      orig_len: u64,
      chunk_bytes: Vec<u8>,
    ) {
      let chash = assetpack_core::Hash32::sha3_256(&chunk_bytes);
      let orig_hash = assetpack_core::Hash32::sha3_256(vec![0u8; orig_len as usize]);
      let recipe = assetpack_core::build_recipe(
        orig_len,
        &[(chash, chunk_bytes.len() as u32)],
        orig_hash,
        transform_id,
        transform_version,
      );
      let rhash = assetpack_core::Hash32::sha3_256(&recipe);
      let mut tx = pool.begin().await.unwrap();
      for (hash, kind, bytes) in [(chash, 1i64, &chunk_bytes), (rhash, 2i64, &recipe)] {
        sqlx::query(
          "INSERT OR REPLACE INTO objects (hash, kind, size, stored_size, codec, content, created_at) \
           VALUES (?1, ?2, ?3, ?3, 'raw', ?4, 0)",
        )
        .bind(hash.as_bytes().as_ref())
        .bind(kind)
        .bind(bytes.len() as i64)
        .bind(bytes)
        .execute(&mut *tx)
        .await
        .unwrap();
      }
      sqlx::query(
        "INSERT INTO storage_assetpack_blobs (scope, key, recipe_hash, content_type, content_length, checksum_crc32, last_modified_ms) \
         VALUES ('blob', ?1, ?2, 'application/octet-stream', ?3, NULL, 0)",
      )
      .bind(key)
      .bind(rhash.to_hex())
      .bind(orig_len as i64)
      .execute(&mut *tx)
      .await
      .unwrap();
      tx.commit().await.unwrap();
    }

    // (a) Zstd decompression bomb: 128 MiB of zeros compresses to ~16 KiB, recipe claims orig_len = 64.
    let zeros = vec![0u8; 128 * 1024 * 1024];
    let zstd_bomb = zstd::encode_all(std::io::Cursor::new(&zeros), 1).expect("encode zstd bomb");
    drop(zeros);
    for ver in [1u16, 2u16] {
      let key = format!("ws/zstd-bomb-v{ver}.bin");
      seed_crafted(
        &pool,
        &key,
        assetpack_core::TRANSFORM_ID_PRECOMP2_ZSTD,
        ver,
        64,
        zstd_bomb.clone(),
      )
      .await;
      let t0 = std::time::Instant::now();
      let bomb_err = ap.get(&key).await.expect_err("zstd bomb must fail");
      assert!(!bomb_err.to_string().is_empty());
      assert!(t0.elapsed() < std::time::Duration::from_secs(2), "bomb rejection must be fast");
    }

    // (a2) PCF2 Dflt segment bomb (v1 and v2): valid PCF2 header (original_size = 64) + single Dflt
    //      segment (orig_len = 64, meta = [0, 0], data_len = 64 MiB of zeros) wrapped in zstd.
    //      Must fail fast (< 1s) with "exceeds budget" under per-file bounded max_total_output.
    for ver in [1u16, 2u16] {
      use std::io::Write as _;
      let mut seg_hdr = Vec::with_capacity(32);
      seg_hdr.extend_from_slice(b"PCF2");
      seg_hdr.extend_from_slice(&ver.to_le_bytes());
      seg_hdr.extend_from_slice(&0u16.to_le_bytes());
      seg_hdr.extend_from_slice(&0u16.to_le_bytes());
      seg_hdr.extend_from_slice(&64u64.to_le_bytes());
      // Segment: kind = Dflt (0x01), flags = 0x00, orig_len = 64, meta_len = 2, data_len = 64 MiB.
      seg_hdr.push(0x01);
      seg_hdr.push(0x00);
      seg_hdr.push(64);
      seg_hdr.push(2);
      let mut v = 64u64 * 1024 * 1024;
      loop {
        let mut byte = (v & 0x7f) as u8;
        v >>= 7;
        if v != 0 {
          byte |= 0x80;
        }
        seg_hdr.push(byte);
        if v == 0 {
          break;
        }
      }
      seg_hdr.extend_from_slice(&[0u8, 0u8]);
      let mut enc = zstd::Encoder::new(Vec::new(), 1).expect("zstd encoder");
      enc.write_all(&seg_hdr).unwrap();
      let zero_chunk = [0u8; 64 * 1024];
      for _ in 0..1024 {
        enc.write_all(&zero_chunk).unwrap();
      }
      let segbomb_zstd = enc.finish().unwrap();
      let key = format!("ws/pcf2-segbomb-v{ver}.bin");
      seed_crafted(
        &pool,
        &key,
        assetpack_core::TRANSFORM_ID_PRECOMP2_ZSTD,
        ver,
        64,
        segbomb_zstd,
      )
      .await;
      let t_seg = std::time::Instant::now();
      let seg_err = ap.get(&key).await.expect_err("pcf2 segbomb must fail");
      assert!(
        seg_err.to_string().contains("exceeds budget"),
        "expected exceeds budget error for v{ver}, got: {seg_err}"
      );
      assert!(
        t_seg.elapsed() < std::time::Duration::from_secs(1),
        "segbomb rejection took {:?}",
        t_seg.elapsed()
      );
    }

    // (a3) PCF2 forged 512 MiB segment on 1 KiB file (v1 and v2): must fail in milliseconds
    //      via `segment_data_limit` without allocating hundreds of MiB.
    for ver in [1u16, 2u16] {
      let mut seg = Vec::with_capacity(32);
      seg.extend_from_slice(b"PCF2");
      seg.extend_from_slice(&ver.to_le_bytes());
      seg.extend_from_slice(&0u16.to_le_bytes());
      seg.extend_from_slice(&0u16.to_le_bytes());
      seg.extend_from_slice(&1024u64.to_le_bytes());
      seg.push(0x01); // Dflt
      seg.push(0x00); // flags
      // orig_len = 1024 (varint: 0x80, 0x08), meta_len = 2, data_len = 512 MiB.
      seg.extend_from_slice(&[0x80, 0x08, 2]);
      let mut v = 512u64 * 1024 * 1024;
      loop {
        let mut byte = (v & 0x7f) as u8;
        v >>= 7;
        if v != 0 {
          byte |= 0x80;
        }
        seg.push(byte);
        if v == 0 {
          break;
        }
      }
      seg.extend_from_slice(&[0u8, 0u8]);
      let key = format!("ws/pcf2-forged-512m-v{ver}.bin");
      seed_crafted(&pool, &key, assetpack_core::TRANSFORM_ID_PRECOMP2, ver, 1024, seg).await;
      let err = ap.get(&key).await.expect_err("forged 512 MiB segment must fail");
      assert!(
        err.to_string().contains("exceeds budget"),
        "expected exceeds budget error for forged 512 MiB v{ver}, got: {err}"
      );
    }

    // (b) 6-byte malformed precomp2 stream for both transform_version 1 and 2.
    let bad_precomp = b"\x00\x05\x00\x00\x00\x00".to_vec();
    let bad_precomp_zstd = zstd::encode_all(std::io::Cursor::new(&bad_precomp), 1).expect("encode bad precomp");
    for ver in [1u16, 2u16] {
      let raw_key = format!("ws/oob-raw-v{ver}.bin");
      seed_crafted(&pool, &raw_key, assetpack_core::TRANSFORM_ID_PRECOMP2, ver, 6, bad_precomp.clone()).await;
      assert!(ap.get(&raw_key).await.is_err(), "malformed precomp2 raw v{ver} must Err");

      let zstd_key = format!("ws/oob-zstd-v{ver}.bin");
      seed_crafted(
        &pool,
        &zstd_key,
        assetpack_core::TRANSFORM_ID_PRECOMP2_ZSTD,
        ver,
        6,
        bad_precomp_zstd.clone(),
      )
      .await;
      assert!(ap.get(&zstd_key).await.is_err(), "malformed precomp2 zstd v{ver} must Err");
    }

    // (c) Object-layer (SQLite `objects` table) zstd and brotli bombs: declared size=64,
    //     compressed content expands to 4 MiB of zeros. Must fail fast at `.take(65)` with Err.
    let bomb_4m = vec![0u8; 4 * 1024 * 1024];
    let zstd_obj = zstd::encode_all(std::io::Cursor::new(&bomb_4m), 1).expect("zstd obj bomb");
    let mut brotli_obj = Vec::new();
    {
      use std::io::Write as _;
      let mut enc = brotli::CompressorWriter::new(&mut brotli_obj, 4096, 4, 20);
      enc.write_all(&bomb_4m).unwrap();
    }
    drop(bomb_4m);
    for (codec, payload, key) in [
      ("zstd", zstd_obj, "ws/obj-zstd-bomb.bin"),
      ("brotli", brotli_obj, "ws/obj-brotli-bomb.bin"),
    ] {
      let claimed_plain = vec![b'A'; 64];
      let chash = assetpack_core::Hash32::sha3_256(&claimed_plain);
      let recipe = assetpack_core::build_recipe(64, &[(chash, 64)], chash, 0, 0);
      let rhash = assetpack_core::Hash32::sha3_256(&recipe);
      let mut tx = pool.begin().await.unwrap();
      sqlx::query(
        "INSERT OR REPLACE INTO objects (hash, kind, size, stored_size, codec, content, created_at) \
         VALUES (?1, 1, 64, ?2, ?3, ?4, 0)",
      )
      .bind(chash.as_bytes().as_ref())
      .bind(payload.len() as i64)
      .bind(codec)
      .bind(&payload)
      .execute(&mut *tx)
      .await
      .unwrap();
      sqlx::query(
        "INSERT OR REPLACE INTO objects (hash, kind, size, stored_size, codec, content, created_at) \
         VALUES (?1, 2, ?2, ?2, 'raw', ?3, 0)",
      )
      .bind(rhash.as_bytes().as_ref())
      .bind(recipe.len() as i64)
      .bind(&recipe)
      .execute(&mut *tx)
      .await
      .unwrap();
      sqlx::query(
        "INSERT INTO storage_assetpack_blobs (scope, key, recipe_hash, content_type, content_length, checksum_crc32, last_modified_ms) \
         VALUES ('blob', ?1, ?2, 'application/octet-stream', 64, NULL, 0)",
      )
      .bind(key)
      .bind(rhash.to_hex())
      .execute(&mut *tx)
      .await
      .unwrap();
      tx.commit().await.unwrap();

      let t_obj = std::time::Instant::now();
      let err = ap.get(key).await.expect_err("object-layer bomb must fail");
      assert!(
        err.to_string().contains("integrity mismatch"),
        "expected bounded object integrity error for {codec}, got: {err}"
      );
      assert!(t_obj.elapsed() < std::time::Duration::from_secs(2));
    }

    // (d) SQL-level bounds rejection: recipe claiming size = MAX_RECIPE_BYTES + 1 with 2 MiB BLOB
    //     must be rejected inside SQL before materializing the BLOB into Rust memory.
    let oversized_recipe_blob = vec![0u8; 2 * 1024 * 1024];
    let bad_rhash = assetpack_core::Hash32::sha3_256(b"oversized-recipe-row");
    let mut tx = pool.begin().await.unwrap();
    sqlx::query(
      "INSERT OR REPLACE INTO objects (hash, kind, size, stored_size, codec, content, created_at) \
       VALUES (?1, 2, ?2, ?3, 'raw', ?4, 0)",
    )
    .bind(bad_rhash.as_bytes().as_ref())
    .bind(32 * 1024 * 1024 + 1i64)
    .bind(oversized_recipe_blob.len() as i64)
    .bind(&oversized_recipe_blob)
    .execute(&mut *tx)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO storage_assetpack_blobs (scope, key, recipe_hash, content_type, content_length, checksum_crc32, last_modified_ms) \
       VALUES ('blob', 'ws/sql-bounds-recipe.bin', ?1, 'application/octet-stream', 64, NULL, 0)",
    )
    .bind(bad_rhash.to_hex())
    .execute(&mut *tx)
    .await
    .unwrap();
    tx.commit().await.unwrap();
    pool.close().await;

    let sql_bounds_err = ap
      .get("ws/sql-bounds-recipe.bin")
      .await
      .expect_err("oversized recipe row must be rejected by SQL bounds");
    assert!(
      sql_bounds_err.to_string().contains("bounds invalid"),
      "expected SQL bounds invalid error, got: {sql_bounds_err}"
    );

    let _ = std::fs::remove_dir_all(&root);
  });
}

#[test]
fn assetpack_storage_spec_parses_precomp2_option_and_defaults_true() {
  let root = std::env::temp_dir().join(format!("affine-ap-spec-{}", uuid::Uuid::new_v4()));
  let root_s = root.to_str().unwrap();

  for (cfg, expected) in [
    (
      serde_json::json!({ "provider": "assetpack", "bucket": "blobs", "config": { "path": root_s } }),
      Ok(true),
    ),
    (
      serde_json::json!({ "provider": "assetpack", "bucket": "blobs", "config": { "path": root_s, "precomp2": null } }),
      Ok(true),
    ),
    (
      serde_json::json!({ "provider": "assetpack", "bucket": "blobs", "config": { "path": root_s, "precomp2": true } }),
      Ok(true),
    ),
    (
      serde_json::json!({ "provider": "assetpack", "bucket": "blobs", "config": { "path": root_s, "precomp2": false } }),
      Ok(false),
    ),
    (
      serde_json::json!({ "provider": "assetpack", "bucket": "blobs", "config": { "path": root_s, "precomp2": "false" } }),
      Err("boolean"),
    ),
    (
      serde_json::json!({ "provider": "assetpack", "bucket": "blobs", "config": { "path": root_s, "precomp2": 0 } }),
      Err("boolean"),
    ),
    (
      serde_json::json!({ "provider": "assetpack", "bucket": "blobs", "config": "not-an-object" }),
      Err("must be an object"),
    ),
  ] {
    let parsed = server_blob::StorageBackendSpec::from_app_config_json(&cfg, "blobs");
    match expected {
      Ok(want_enabled) => {
        let spec = parsed.expect("valid assetpack spec").expect("some spec");
        match &spec {
          server_blob::StorageBackendSpec::Assetpack { precomp2, .. } => {
            assert_eq!(*precomp2, want_enabled, "for {cfg}");
          }
          other => panic!("expected Assetpack spec, got {other:?}"),
        }
        assert!(spec.build().is_ok(), "build failed for {cfg}");
        let direct = server_blob::AssetpackBlobStorage::new(root_s, "blobs", "blob")
          .unwrap()
          .with_precomp2(want_enabled);
        assert_eq!(direct.precomp2_enabled(), want_enabled);
      }
      Err(needle) => {
        let err = parsed.expect_err(&format!("expected error for {cfg}"));
        assert!(
          err.to_string().contains(needle),
          "expected error containing `{needle}`, got `{err}`"
        );
      }
    }
  }
  assert!(
    server_blob::AssetpackBlobStorage::new(root_s, "blobs", "blob")
      .unwrap()
      .precomp2_enabled()
  );

  // Exact parity check: fs config with `precomp2` must be rejected by both app_config validation
  // and startup StorageBackendSpec::from_app_config_json.
  let bad_fs = serde_json::json!({
    "provider": "fs",
    "bucket": "blobs",
    "config": { "path": root_s, "precomp2": false }
  });
  let defaults =
    server_domain::app_config::default_app_config_json(&server_domain::app_config::RuntimeAppConfigBaseline::default());
  assert!(
    server_domain::app_config::validate_config_value("storages.blob.storage", &bad_fs, &defaults).is_err(),
    "app_config validation must reject fs precomp2"
  );
  assert!(
    server_blob::StorageBackendSpec::from_app_config_json(&bad_fs, "blobs").is_err(),
    "StorageBackendSpec::from_app_config_json must reject fs precomp2"
  );
  let _ = std::fs::remove_dir_all(&root);
}
