//! `BlobService` on real PostgreSQL 16 (the `v0.27.5` migration template)
//! with local file-system storage: upload, idempotent re-upload, conflicts,
//! reserved key names, soft delete and release, per-blob and total quota
//! admission, serialized concurrent admission under the workspace row lock,
//! concurrent uploads of one key, and storage failures.

use std::{
  path::PathBuf,
  sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
  },
};

use chrono::{DateTime, Utc};
use server_blob::{
  BlobService, BlobStorageBackend, LocalFsBlobStorage, ObjectMetadata, PutBlobOutcome, S3BlobStorage, S3Config,
  StorageError,
};
use server_db::{DbConfig, ServerDb, WorkloadTier};
use server_spi::QuotaGate;
use server_types::{AccessGrant, DomainError};
use sqlx::{Postgres, Transaction};
use test_db_harness::{
  migrations::MigrationSet,
  pg::{DEFAULT_LEASE_TTL, DbLease, PgCluster},
};

struct FixedQuotaGate {
  blob_limit: i64,
  storage_quota: i64,
  seat_limit: i32,
}

#[async_trait::async_trait]
impl QuotaGate for FixedQuotaGate {
  async fn resolve_workspace_grant(
    &self,
    _tx: &mut Transaction<'_, Postgres>,
    _workspace_id: &str,
    _now: DateTime<Utc>,
  ) -> Result<AccessGrant, DomainError> {
    let mut grant = server_types::license::default_selfhost_access_grant();
    grant.limits.blob_limit_bytes = self.blob_limit;
    grant.limits.storage_quota_bytes = self.storage_quota;
    grant.limits.seat_limit = self.seat_limit;
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

fn runtime() -> tokio::runtime::Runtime {
  tokio::runtime::Builder::new_multi_thread()
    .worker_threads(4)
    .enable_all()
    .build()
    .unwrap()
}

/// Local storage whose writes and deletes can be made to fail, and whose
/// next delete can be held at a gate.
struct FlakyStorage {
  inner: LocalFsBlobStorage,
  fail_put: AtomicBool,
  fail_delete: AtomicBool,
  delete_gate: tokio::sync::Mutex<Option<DeleteGate>>,
}

/// Signals when a delete reaches the gate, then waits to be let through.
type DeleteGate = (tokio::sync::oneshot::Sender<()>, tokio::sync::oneshot::Receiver<()>);

fn injected(operation: &str) -> StorageError {
  StorageError::Request {
    context: operation.to_owned(),
    message: "injected failure".into(),
  }
}

#[async_trait::async_trait]
impl BlobStorageBackend for FlakyStorage {
  async fn put(&self, key: &str, body: Vec<u8>, content_type: &str) -> Result<ObjectMetadata, StorageError> {
    if self.fail_put.load(Ordering::SeqCst) {
      return Err(injected("put"));
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
    if self.fail_delete.load(Ordering::SeqCst) {
      return Err(injected("delete"));
    }
    if let Some((entered, release)) = self.delete_gate.lock().await.take() {
      let _ = entered.send(());
      let _ = release.await;
    }
    self.inner.delete(key).await
  }
}

struct Fixture {
  db: ServerDb,
  storage: Arc<FlakyStorage>,
  _dir: TempDir,
}

struct TempDir(PathBuf);

impl Drop for TempDir {
  fn drop(&mut self) {
    let _ = std::fs::remove_dir_all(&self.0);
  }
}

impl Fixture {
  async fn new(db_url: &str) -> Self {
    let db = ServerDb::connect(DbConfig::new(db_url))
      .await
      .expect("connect ServerDb");
    let dir = std::env::temp_dir().join(format!("server-blob-{}", uuid::Uuid::new_v4().simple()));
    let storage = Arc::new(FlakyStorage {
      inner: LocalFsBlobStorage::new(dir.to_str().unwrap(), "blobs").unwrap(),
      fail_put: AtomicBool::new(false),
      fail_delete: AtomicBool::new(false),
      delete_gate: tokio::sync::Mutex::new(None),
    });
    Self {
      db,
      storage,
      _dir: TempDir(dir),
    }
  }

  fn service(&self, blob_limit: i64, storage_quota: i64, seat_limit: i32) -> BlobService {
    BlobService::new(
      self.db.clone(),
      self.storage.clone(),
      Arc::new(FixedQuotaGate {
        blob_limit,
        storage_quota,
        seat_limit,
      }),
    )
  }

  async fn workspace(&self) -> String {
    let id = uuid::Uuid::new_v4().to_string();
    let mut conn = self.db.acquire_tiered(WorkloadTier::InteractiveWrite).await.unwrap();
    sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
      .bind(&id)
      .execute(conn.as_conn())
      .await
      .unwrap();
    id
  }

  async fn statuses(&self, workspace_id: &str) -> Vec<(String, String, bool)> {
    let mut conn = self.db.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
    sqlx::query_as("SELECT key, status::text, deleted_at IS NOT NULL FROM blobs WHERE workspace_id=$1 ORDER BY key")
      .bind(workspace_id)
      .fetch_all(conn.as_conn())
      .await
      .unwrap()
  }

  /// Holds the next storage delete; returns (entered, release).
  async fn gate_next_delete(&self) -> (tokio::sync::oneshot::Receiver<()>, tokio::sync::oneshot::Sender<()>) {
    let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
    let (release_tx, release_rx) = tokio::sync::oneshot::channel();
    *self.storage.delete_gate.lock().await = Some((entered_tx, release_rx));
    (entered_rx, release_tx)
  }

  /// Waits until `count` sessions of this database last ran the object-lock
  /// attempt (`pg_try_advisory_lock`): holders that took it and waiters still
  /// polling for it.
  async fn wait_for_object_lock_sessions(&self, count: i64) {
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(10);
    loop {
      let mut conn = self.db.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
      let sessions: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND \
         query LIKE 'SELECT pg_try_advisory_lock(hashtextextended%'",
      )
      .fetch_one(conn.as_conn())
      .await
      .unwrap();
      if sessions >= count {
        return;
      }
      assert!(
        tokio::time::Instant::now() < deadline,
        "only {sessions} of {count} lock sessions"
      );
      tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
  }

  async fn row_count(&self, workspace_id: &str) -> i64 {
    let mut conn = self.db.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
    sqlx::query_scalar("SELECT count(*) FROM blobs WHERE workspace_id=$1")
      .bind(workspace_id)
      .fetch_one(conn.as_conn())
      .await
      .unwrap()
  }

  async fn has_object(&self, workspace_id: &str, key: &str) -> bool {
    self
      .storage
      .head(&format!("{workspace_id}/{key}"))
      .await
      .unwrap()
      .is_some()
  }
}

fn quota_kind(result: Result<PutBlobOutcome, DomainError>) -> &'static str {
  match result {
    Err(DomainError::QuotaExceeded { kind, .. }) => kind,
    other => panic!("expected quota rejection, got {other:?}"),
  }
}

#[test]
fn put_get_list_delete_release_round_trip_with_dedup_conflicts_and_reserved_keys() {
  let lease = leased_0275_database();
  runtime().block_on(async {
    let fx = Fixture::new(lease.url()).await;
    let service = fx.service(1 << 20, 1 << 30, 10);
    let ws = fx.workspace().await;

    let created = service
      .put_blob(&ws, "key-a", "image/png", b"hello".to_vec())
      .await
      .unwrap();
    let PutBlobOutcome::Created(record) = &created else {
      panic!("expected Created, got {created:?}");
    };
    assert_eq!((record.size, record.mime.as_str()), (5, "image/png"));
    let sidecar = fx.storage.inner.bucket_dir().join(&ws).join("key-a.metadata.json");
    let sidecar: serde_json::Value = serde_json::from_slice(&std::fs::read(sidecar).unwrap()).unwrap();
    assert_eq!(sidecar["contentType"], "image/png");
    assert_eq!(sidecar["contentLength"], 5);
    assert_eq!(sidecar["checksumCRC32"], server_blob::checksum_crc32_base64(b"hello"));

    let again = service
      .put_blob(&ws, "key-a", "image/png", b"hello".to_vec())
      .await
      .unwrap();
    assert_eq!(again, PutBlobOutcome::AlreadyExists(record.clone()));
    assert_eq!(fx.row_count(&ws).await, 1);

    for (mime, body, message) in [
      ("image/png", b"hello!".to_vec(), "blob size mismatch"),
      ("image/jpeg", b"hello".to_vec(), "blob mime mismatch"),
    ] {
      match service.put_blob(&ws, "key-a", mime, body).await {
        Err(DomainError::Conflict(got)) => assert_eq!(got, message),
        other => panic!("expected conflict {message}, got {other:?}"),
      }
    }
    match service.put_blob(&ws, "key-a", "image/png", b"olleh".to_vec()).await {
      Err(DomainError::Conflict(message)) => assert_eq!(message, "blob content mismatch"),
      other => panic!("expected content conflict, got {other:?}"),
    }
    for key in ["../key", "key-a.metadata.json", "KEY-A.METADATA.JSON", "key-a.tmp-0"] {
      assert!(
        matches!(
          service.put_blob(&ws, key, "image/png", b"x".to_vec()).await,
          Err(DomainError::Validation(_))
        ),
        "{key}"
      );
    }

    let (got, body) = service.get_blob(&ws, "key-a").await.unwrap().expect("live blob");
    assert_eq!((got, body), (record.clone(), b"hello".to_vec()));
    service
      .put_blob(&ws, "key-b", "text/plain", b"b".to_vec())
      .await
      .unwrap();
    let keys: Vec<String> = service
      .list_blobs(&ws)
      .await
      .unwrap()
      .into_iter()
      .map(|r| r.key)
      .collect();
    assert_eq!(keys, ["key-a", "key-b"]);

    assert!(service.delete_blob(&ws, "key-a", false).await.unwrap());
    assert!(!service.delete_blob(&ws, "key-a", false).await.unwrap());
    assert!(service.get_blob(&ws, "key-a").await.unwrap().is_none());
    assert!(fx.has_object(&ws, "key-a").await, "soft delete keeps the object");
    match service.put_blob(&ws, "key-a", "image/png", b"hello".to_vec()).await {
      Err(DomainError::Conflict(message)) => assert_eq!(message, "storage key is deleted"),
      other => panic!("expected deleted-key conflict, got {other:?}"),
    }

    assert_eq!(service.release_deleted_blobs(&ws).await.unwrap(), 1);
    assert!(!fx.has_object(&ws, "key-a").await);
    assert_eq!(fx.row_count(&ws).await, 1);
    assert!(matches!(
      service.put_blob(&ws, "key-a", "image/png", b"hello".to_vec()).await,
      Ok(PutBlobOutcome::Created(_))
    ));

    assert!(service.delete_blob(&ws, "key-b", true).await.unwrap());
    assert!(!fx.has_object(&ws, "key-b").await);
    assert_eq!(fx.row_count(&ws).await, 1);
  });
}

#[test]
fn quota_admission_rejects_blob_limit_storage_quota_readonly_and_missing_workspace() {
  let lease = leased_0275_database();
  runtime().block_on(async {
    let fx = Fixture::new(lease.url()).await;
    let ws = fx.workspace().await;
    let service = fx.service(10, 25, 10);

    // A live pending reservation of another key counts toward usage.
    {
      let mut conn = fx.db.acquire_tiered(WorkloadTier::InteractiveWrite).await.unwrap();
      sqlx::query(
        "INSERT INTO blobs (workspace_id, key, size, mime, status, reservation_expires_at) VALUES ($1, 'pending', \
         5, 'a/b', 'pending', clock_timestamp() + interval '10 minutes')",
      )
      .bind(&ws)
      .execute(conn.as_conn())
      .await
      .unwrap();
    }

    // (key, size, expected rejection kind or None) — usage starts at 5.
    for (key, size, rejected) in [
      ("k1", 8, None),
      ("too-big", 11, Some("blob_limit")),
      ("k2", 8, None),
      ("overflow", 8, Some("storage_quota")),
      ("k3", 4, None),
      ("full", 1, Some("storage_quota")),
    ] {
      let result = service
        .put_blob(&ws, key, "application/octet-stream", vec![7; size])
        .await;
      match rejected {
        None => assert!(matches!(result, Ok(PutBlobOutcome::Created(_))), "{key}: {result:?}"),
        Some(kind) => {
          assert_eq!(quota_kind(result), kind, "{key}");
          assert!(
            !fx.has_object(&ws, key).await,
            "{key}: rejected object must not be stored"
          );
        }
      }
    }
    assert!(matches!(
      service.put_blob(&ws, "pending", "a/b", vec![0; 5]).await,
      Err(DomainError::Conflict(message)) if message == "blob upload is pending"
    ));

    let readonly = fx.service(1 << 20, 1 << 30, 0);
    assert_eq!(
      quota_kind(readonly.put_blob(&ws, "ro", "a/b", vec![1]).await),
      "blob_limit"
    );

    let missing = uuid::Uuid::new_v4().to_string();
    assert!(matches!(
      service.put_blob(&missing, "k", "a/b", vec![1]).await,
      Err(DomainError::NotFound(_))
    ));
    assert!(!fx.has_object(&missing, "k").await);
  });
}

#[test]
fn concurrent_uploads_are_admitted_one_at_a_time_under_the_workspace_lock() {
  let lease = leased_0275_database();
  runtime().block_on(async {
    let fx = Fixture::new(lease.url()).await;
    let ws = fx.workspace().await;
    let service = Arc::new(fx.service(10, 25, 10));

    let mut uploads = Vec::new();
    for idx in 0..6 {
      let service = Arc::clone(&service);
      let ws = ws.clone();
      uploads.push(tokio::spawn(async move {
        service.put_blob(&ws, &format!("c{idx}"), "a/b", vec![idx; 10]).await
      }));
    }
    let mut created = 0;
    for upload in uploads {
      match upload.await.unwrap() {
        Ok(PutBlobOutcome::Created(_)) => created += 1,
        Err(DomainError::QuotaExceeded {
          kind: "storage_quota", ..
        }) => {}
        other => panic!("unexpected outcome {other:?}"),
      }
    }
    assert_eq!(created, 2, "only two 10-byte blobs fit a 25-byte quota");
    assert_eq!(fx.row_count(&ws).await, 2);
    let total: i64 = service.list_blobs(&ws).await.unwrap().iter().map(|r| r.size).sum();
    assert_eq!(total, 20);
  });
}

#[test]
fn concurrent_uploads_of_one_key_keep_exactly_the_winners_bytes() {
  let lease = leased_0275_database();
  runtime().block_on(async {
    let fx = Fixture::new(lease.url()).await;
    let ws = fx.workspace().await;
    let service = Arc::new(fx.service(1 << 20, 1 << 30, 10));

    for round in 0..8 {
      let key = format!("race-{round}");
      let bodies = [vec![b'a'; 10], vec![b'b'; 20]];
      let uploads: Vec<_> = bodies
        .iter()
        .cloned()
        .map(|body| {
          let service = Arc::clone(&service);
          let (ws, key) = (ws.clone(), key.clone());
          tokio::spawn(async move { service.put_blob(&ws, &key, "a/b", body).await })
        })
        .collect();
      let mut winner = None;
      let mut conflicts = 0;
      for (upload, body) in uploads.into_iter().zip(bodies) {
        match upload.await.unwrap() {
          Ok(PutBlobOutcome::Created(_)) => {
            assert!(winner.replace(body).is_none(), "round {round}: two uploads won");
          }
          Err(DomainError::Conflict(_)) => conflicts += 1,
          other => panic!("round {round}: unexpected outcome {other:?}"),
        }
      }
      assert_eq!(conflicts, 1, "round {round}");
      let (_, stored) = service.get_blob(&ws, &key).await.unwrap().expect("winner is readable");
      assert_eq!(Some(stored), winner, "round {round}: stored bytes are the winner's");
    }
  });
}

#[test]
fn storage_failures_keep_ledger_consistent_and_retryable_without_leaking_details() {
  let lease = leased_0275_database();
  runtime().block_on(async {
    let fx = Fixture::new(lease.url()).await;
    let ws = fx.workspace().await;
    let service = fx.service(1 << 20, 1 << 30, 10);
    let unavailable = |result: Result<_, DomainError>| match result {
      Err(DomainError::Unavailable(message)) => assert_eq!(message, "blob storage unavailable"),
      other => panic!("expected storage unavailable, got {other:?}"),
    };

    // A failed object write abandons its reservation: no row, no object.
    fx.storage.fail_put.store(true, Ordering::SeqCst);
    unavailable(service.put_blob(&ws, "k", "a/b", b"data".to_vec()).await.map(|_| ()));
    assert!(fx.statuses(&ws).await.is_empty());
    fx.storage.fail_put.store(false, Ordering::SeqCst);
    assert!(matches!(
      service.put_blob(&ws, "k", "a/b", b"data".to_vec()).await,
      Ok(PutBlobOutcome::Created(_))
    ));

    // A failed object delete keeps the row soft-deleted: the key stays
    // blocked and the deletion can be retried by release.
    fx.storage.fail_delete.store(true, Ordering::SeqCst);
    unavailable(service.delete_blob(&ws, "k", true).await.map(|_| ()));
    assert_eq!(fx.statuses(&ws).await, [("k".to_owned(), "completed".to_owned(), true)]);
    assert!(fx.has_object(&ws, "k").await);
    assert!(service.get_blob(&ws, "k").await.unwrap().is_none());
    assert!(matches!(
      service.put_blob(&ws, "k", "a/b", b"data".to_vec()).await,
      Err(DomainError::Conflict(message)) if message == "storage key is deleted"
    ));
    unavailable(service.release_deleted_blobs(&ws).await.map(|_| ()));
    fx.storage.fail_delete.store(false, Ordering::SeqCst);
    assert_eq!(service.release_deleted_blobs(&ws).await.unwrap(), 1);
    assert!(fx.statuses(&ws).await.is_empty());
    assert!(!fx.has_object(&ws, "k").await);

    // An unreachable S3 endpoint surfaces only the fixed message; the
    // reservation it could not clean up stays pending until it expires.
    let port = {
      let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
      listener.local_addr().unwrap().port()
    };
    let s3 = S3BlobStorage::new(S3Config {
      endpoint: Some(format!("http://127.0.0.1:{port}")),
      region: "us-east-1".into(),
      bucket: "affine-blobs".into(),
      access_key_id: "AKIDLEAKCHECK".into(),
      secret_access_key: "secret".into(),
      session_token: Some("SESSIONLEAKCHECK".into()),
      force_path_style: true,
      request_timeout: Some(std::time::Duration::from_secs(5)),
    })
    .unwrap();
    let s3_service = BlobService::new(
      fx.db.clone(),
      Arc::new(s3),
      Arc::new(FixedQuotaGate {
        blob_limit: 1 << 20,
        storage_quota: 1 << 30,
        seat_limit: 10,
      }),
    );
    let error = s3_service
      .put_blob(&ws, "s3-key", "a/b", b"x".to_vec())
      .await
      .unwrap_err()
      .to_string();
    assert_eq!(error, "unavailable: blob storage unavailable");
    for secret in [
      "X-Amz-Signature",
      "X-Amz-Credential",
      "X-Amz-Security-Token",
      "AKIDLEAKCHECK",
    ] {
      assert!(!error.contains(secret), "{secret} leaked: {error}");
    }
    assert_eq!(
      fx.statuses(&ws).await,
      [("s3-key".to_owned(), "pending".to_owned(), false)]
    );
  });
}

#[test]
fn reupload_waits_for_an_in_flight_permanent_delete_and_keeps_its_new_object() {
  let lease = leased_0275_database();
  runtime().block_on(async {
    let fx = Fixture::new(lease.url()).await;
    let ws = fx.workspace().await;
    let service = Arc::new(fx.service(1 << 20, 1 << 30, 10));
    service.put_blob(&ws, "k", "a/b", b"old".to_vec()).await.unwrap();

    let (entered, release) = fx.gate_next_delete().await;
    let delete = tokio::spawn({
      let (service, ws) = (Arc::clone(&service), ws.clone());
      async move { service.delete_blob(&ws, "k", true).await }
    });
    entered.await.unwrap();
    // The permanent delete holds the object lock inside its object delete;
    // the re-upload has to wait for it.
    let upload = tokio::spawn({
      let (service, ws) = (Arc::clone(&service), ws.clone());
      async move { service.put_blob(&ws, "k", "a/b", b"new-content".to_vec()).await }
    });
    fx.wait_for_object_lock_sessions(2).await;
    release.send(()).unwrap();

    assert!(delete.await.unwrap().unwrap());
    assert!(matches!(upload.await.unwrap(), Ok(PutBlobOutcome::Created(_))));
    let (_, stored) = service.get_blob(&ws, "k").await.unwrap().expect("new blob");
    assert_eq!(stored, b"new-content");
  });
}

#[test]
fn release_rereads_under_the_object_lock_and_skips_a_key_revived_meanwhile() {
  let lease = leased_0275_database();
  runtime().block_on(async {
    let fx = Fixture::new(lease.url()).await;
    let ws = fx.workspace().await;
    let service = Arc::new(fx.service(1 << 20, 1 << 30, 10));
    service.put_blob(&ws, "k", "a/b", b"old".to_vec()).await.unwrap();
    assert!(service.delete_blob(&ws, "k", false).await.unwrap());

    // Another cleaner holds the object lock: the release has already listed
    // `k` as soft-deleted and waits for the lock.
    let mut holder = fx.db.dedicated_session_conn().await.unwrap();
    sqlx::query("SELECT pg_advisory_lock(hashtextextended($1, 0))")
      .bind(format!("storage-object:{ws}/k"))
      .execute(&mut holder)
      .await
      .unwrap();
    let release = tokio::spawn({
      let (service, ws) = (Arc::clone(&service), ws.clone());
      async move { service.release_deleted_blobs(&ws).await }
    });
    fx.wait_for_object_lock_sessions(1).await;

    // Under that lock the other cleaner removes the old blob and a new upload
    // revives the key.
    let object_key = format!("{ws}/k");
    fx.storage.inner.delete(&object_key).await.unwrap();
    {
      let mut conn = fx.db.acquire_tiered(WorkloadTier::InteractiveWrite).await.unwrap();
      sqlx::query("DELETE FROM blobs WHERE workspace_id=$1 AND key='k'")
        .bind(&ws)
        .execute(conn.as_conn())
        .await
        .unwrap();
      fx.storage
        .inner
        .put(&object_key, b"new-content".to_vec(), "a/b")
        .await
        .unwrap();
      sqlx::query("INSERT INTO blobs (workspace_id, key, size, mime) VALUES ($1, 'k', 11, 'a/b')")
        .bind(&ws)
        .execute(conn.as_conn())
        .await
        .unwrap();
    }
    sqlx::query("SELECT pg_advisory_unlock(hashtextextended($1, 0))")
      .bind(format!("storage-object:{ws}/k"))
      .execute(&mut holder)
      .await
      .unwrap();

    assert_eq!(release.await.unwrap().unwrap(), 0, "the revived key is not released");
    let (_, stored) = service.get_blob(&ws, "k").await.unwrap().expect("revived blob");
    assert_eq!(stored, b"new-content");
  });
}

#[test]
fn lock_holders_never_starve_a_tiny_pool() {
  let lease = leased_0275_database();
  runtime().block_on(async {
    let fx = Fixture::new(lease.url()).await;
    let ws = fx.workspace().await;
    let mut config = DbConfig::new(lease.url());
    config.max_connections = 2;
    config.tier_permits = [1, 1, 1, 1];
    let tiny = ServerDb::connect(config).await.expect("connect tiny pool");
    let service = Arc::new(BlobService::new(
      tiny,
      fx.storage.clone(),
      Arc::new(FixedQuotaGate {
        blob_limit: 1 << 20,
        storage_quota: 1 << 30,
        seat_limit: 10,
      }),
    ));

    // More concurrent uploads than pooled connections: each holds its storage
    // locks on a dedicated session while its queries use the pool.
    let uploads: Vec<_> = (0..4u8)
      .map(|idx| {
        let (service, ws) = (Arc::clone(&service), ws.clone());
        tokio::spawn(async move { service.put_blob(&ws, &format!("tiny-{idx}"), "a/b", vec![idx; 4]).await })
      })
      .collect();
    let outcomes = tokio::time::timeout(std::time::Duration::from_secs(20), async {
      let mut outcomes = Vec::new();
      for upload in uploads {
        outcomes.push(upload.await.unwrap());
      }
      outcomes
    })
    .await
    .expect("uploads finish without exhausting the pool");
    for outcome in outcomes {
      assert!(matches!(outcome, Ok(PutBlobOutcome::Created(_))), "{outcome:?}");
    }
    assert_eq!(fx.row_count(&ws).await, 4);
  });
}
