//! Workspace blob storage: object backends (local file system, S3-compatible)
//! and [`BlobService`], which keeps the `public.blobs` ledger and admits
//! uploads through [`QuotaGate`].
//!
//! Objects live at `<workspace_id>/<key>`, the `v0.27.5` final locator. A
//! server-mediated upload is a reservation protocol:
//! 1. under the `workspaces` row lock it admits the upload (grant, per-blob
//!    limit, storage quota) and records a `pending` row with a fresh
//!    `reservation_id`, which charges the quota and makes any concurrent
//!    upload of the key a conflict;
//! 2. it writes the object outside any transaction, so a slow upload never
//!    trips `idle_in_transaction_session_timeout`;
//! 3. it turns its own live reservation into a `completed` row.
//!
//! Every object lifecycle operation (upload, permanent delete, release) holds
//! the reference server's storage session locks for its object
//! (`StorageObjectLock`), so uploads, deletes and releases of one key never
//! interleave, with each other or with the `v0.27.5` server, and each re-reads
//! the ledger under the lock. A failed upload removes the object and its
//! pending row only while that row still carries its own `reservation_id`. Storage usage counts what the
//! reference strict quota counts: completed and unexpired pending `blobs` and
//! `comment_attachments` that are not deleted. Permanent deletion keeps the
//! row soft-deleted until its object is gone, so a failed object delete can be
//! retried and the key cannot be reused meanwhile.

mod assetpack;
pub mod multipart;
pub mod reconcile;
pub mod refs;
mod s3;
mod storage;

use std::{sync::Arc, time::Duration};

use chrono::{DateTime, Utc};
use server_db::{ServerDb, WorkloadTier};
use server_spi::QuotaGate;
use server_types::DomainError;
use sqlx::{Connection as _, PgConnection, Postgres, Row as _, Transaction};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

pub use crate::{
  assetpack::AssetpackBlobStorage,
  multipart::{BlobUploadInitPlan, BlobUploadPartPlan, StorageBackendSpec, UploadInitMethod},
  reconcile::{ExpiredReservationCleanupReport, StorageOrphanReconcileReport},
  s3::{S3BlobStorage, S3Config, S3UploadOptions},
  storage::{
    BlobStorageBackend, DynamicBlobStorage, LocalFsBlobStorage, MULTIPART_PART_SIZE, MULTIPART_THRESHOLD,
    MultipartUploadInit, ObjectMetadata, PROXY_MULTIPART_PATH, PROXY_UPLOAD_PATH, PresignedUpload,
    StorageBackendIdentity, StorageCapabilities, StorageError, UploadUrlConfig, UploadedPart, checksum_crc32_base64,
    is_reserved_segment, normalize_storage_key, sign_proxy_upload_token, verify_proxy_upload_token,
  },
};

/// Longest accepted blob key, in bytes.
pub const MAX_BLOB_KEY_BYTES: usize = 1024;
/// Dedicated storage-lock sessions one [`BlobService`] keeps open at once.
pub const DEFAULT_STORAGE_LOCK_CONCURRENCY: usize = 8;
/// How long an upload reservation charges quota and holds its key.
pub const STORAGE_RESERVATION_MINUTES: i32 = 5;

/// A completed, live `public.blobs` row.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BlobRecord {
  pub workspace_id: String,
  pub key: String,
  pub size: i64,
  pub mime: String,
  pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PutBlobOutcome {
  /// The object was stored and its row recorded.
  Created(BlobRecord),
  /// The same bytes were already stored under the key; nothing was written
  /// or charged.
  AlreadyExists(BlobRecord),
}

impl PutBlobOutcome {
  pub fn record(&self) -> &BlobRecord {
    match self {
      Self::Created(record) | Self::AlreadyExists(record) => record,
    }
  }
}

/// A blob key is one object-key segment: non-empty, at most
/// [`MAX_BLOB_KEY_BYTES`], not `.`/`..`, without `/`, `\` or control
/// characters, and not a name the local storage reserves for its sidecars and
/// temporary files ([`is_reserved_segment`]).
pub fn validate_blob_key(key: &str) -> Result<(), DomainError> {
  let valid = !key.is_empty()
    && key.len() <= MAX_BLOB_KEY_BYTES
    && key != "."
    && key != ".."
    && !key.chars().any(|c| c == '/' || c == '\\' || c == '%' || c.is_control())
    && !is_reserved_segment(key);
  if valid {
    Ok(())
  } else {
    Err(DomainError::Validation(format!(
      "invalid blob key `{}`",
      key.escape_debug()
    )))
  }
}

/// `<workspace_id>/<key>`, the object locator shared with `v0.27.5`.
pub fn blob_object_key(workspace_id: &str, key: &str) -> Result<String, DomainError> {
  validate_blob_key(workspace_id)?;
  validate_blob_key(key)?;
  Ok(format!("{workspace_id}/{key}"))
}

pub(crate) fn db_error(context: &'static str) -> impl FnOnce(sqlx::Error) -> DomainError {
  move |err| DomainError::Internal(format!("{context}: {err}"))
}

/// Backend failures are logged here and reach callers only as a fixed
/// message: their text can name storage endpoints or carry provider responses.
pub(crate) fn storage_error(err: StorageError) -> DomainError {
  match err {
    StorageError::InvalidKey(key) => DomainError::Validation(format!("invalid storage key `{key}`")),
    StorageError::Config(msg) if msg.starts_with("blob_invalid:") => DomainError::Validation(msg),
    other => {
      tracing::warn!(error = %other, "blob storage operation failed");
      DomainError::Unavailable("blob storage unavailable".into())
    }
  }
}

/// Verifies `Workspace.Blobs.Manage` (`Owner`, or `Admin` under a commercial
/// workspace grant + non-disabled user) inside an open transaction, acquiring
/// row locks in canonical order (`users` -> `workspaces`) on mutation paths to
/// match `strict_quota/management.rs:188-220` and `access_control/permission.rs`.
async fn assert_blobs_manage_in_tx(
  tx: &mut Transaction<'_, Postgres>,
  quota: &dyn QuotaGate,
  actor_user_id: &str,
  workspace_id: &str,
  for_update: bool,
) -> Result<(), DomainError> {
  if for_update {
    let owner_id: Option<String> = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
    )
    .bind(workspace_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error("load workspace owner for blob manage"))?;

    let mut lock_user_ids = vec![actor_user_id.to_owned()];
    if let Some(owner) = owner_id
      && owner != actor_user_id
    {
      lock_user_ids.push(owner);
    }
    lock_user_ids.sort();
    for uid in &lock_user_ids {
      sqlx::query("SELECT id FROM users WHERE id=$1 FOR UPDATE")
        .bind(uid)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error("lock user for blob manage"))?;
    }
    let ws_exists: Option<String> = sqlx::query_scalar("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE")
      .bind(workspace_id)
      .fetch_optional(&mut **tx)
      .await
      .map_err(db_error("lock workspace for blob manage"))?;
    if ws_exists.is_none() {
      return Err(DomainError::NotFound(format!("workspace {workspace_id}")));
    }
  }

  let disabled: Option<bool> = sqlx::query_scalar("SELECT disabled FROM users WHERE id=$1")
    .bind(actor_user_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error("check actor disabled for blob manage"))?;
  if disabled != Some(false) {
    return Err(DomainError::Forbidden("workspace blob management forbidden".into()));
  }

  let role: Option<String> = sqlx::query_scalar(
    "SELECT role::text FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND state='active'",
  )
  .bind(workspace_id)
  .bind(actor_user_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(db_error("check actor role for blob manage"))?;
  let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
    .fetch_one(&mut **tx)
    .await
    .map_err(db_error("load db clock for blob manage"))?;
  let grant = quota.resolve_workspace_grant(tx, workspace_id, now).await?;
  let allowed = match role.as_deref() {
    Some("owner") => true,
    Some("admin") => grant.rights.commercial,
    _ => false,
  };
  if !allowed {
    return Err(DomainError::Forbidden(
      "workspace blob management requires owner or commercial admin role".into(),
    ));
  }
  Ok(())
}

pub(crate) enum Admission {
  /// A live completed row with the same size and mime; its bytes still have
  /// to be compared.
  Existing(BlobRecord),
  /// A pending row now holds the key under this reservation id.
  Reserved(String),
}

const STORAGE_LOCK_TIMEOUT: Duration = Duration::from_secs(5);
const STORAGE_LOCK_POLL: Duration = Duration::from_millis(25);

/// The `v0.27.5` `StorageOperation` session locks
/// (`packages/backend/native/src/runtime/storage_lifecycle.rs`), so object
/// lifecycle work is serialized with the reference server too: a shared
/// `storage-workspace:<workspace_id>` lock, then an exclusive
/// `storage-object:<workspace_id>/<key>` lock, both taken by polling within
/// one 5 s budget and released in reverse order.
///
/// The locks live on a dedicated session outside the `PgPool`, admitted by
/// the service's own lock permits, so an operation holding them can still
/// take pooled connections for its queries without exhausting the pool.
/// A timeout or a failed lock closes the session. Dropping the lock without
/// [`StorageObjectLock::release`] (cancellation) drops the session, which
/// ends its locks.
// compat(coexist): blob-storage-operation-session-lock -- v0.27.5 storage-workspace and storage-object session advisory locks
pub(crate) struct StorageObjectLock {
  connection: PgConnection,
  workspace_key: String,
  object_key: String,
  _permit: OwnedSemaphorePermit,
}

impl StorageObjectLock {
  pub(crate) async fn acquire(
    db: &ServerDb,
    permits: &Arc<Semaphore>,
    workspace_id: &str,
    object_key: &str,
  ) -> Result<Self, DomainError> {
    let deadline = tokio::time::Instant::now() + STORAGE_LOCK_TIMEOUT;
    let timed_out = || DomainError::Unavailable("storage_lifecycle_lock_timeout".into());
    let (permit, connection) = tokio::time::timeout_at(deadline, async {
      let permit = Arc::clone(permits)
        .acquire_owned()
        .await
        .map_err(|_| DomainError::Unavailable("storage lock permits closed".into()))?;
      let connection = db
        .dedicated_session_conn()
        .await
        .map_err(|err| DomainError::Unavailable(format!("storage lock session: {err}")))?;
      Ok::<_, DomainError>((permit, connection))
    })
    .await
    .map_err(|_| timed_out())??;
    let mut lock = Self {
      connection,
      workspace_key: format!("storage-workspace:{workspace_id}"),
      object_key: format!("storage-object:{object_key}"),
      _permit: permit,
    };
    let locked = tokio::time::timeout_at(deadline, lock.take_locks()).await;
    match locked {
      Ok(Ok(())) => Ok(lock),
      Ok(Err(err)) => {
        let _ = lock.connection.close().await;
        Err(err)
      }
      Err(_) => {
        let _ = lock.connection.close().await;
        Err(timed_out())
      }
    }
  }

  async fn take_locks(&mut self) -> Result<(), DomainError> {
    for (statement, name) in [
      (
        "SELECT pg_try_advisory_lock_shared(hashtextextended($1,0))",
        self.workspace_key.clone(),
      ),
      (
        "SELECT pg_try_advisory_lock(hashtextextended($1,0))",
        self.object_key.clone(),
      ),
    ] {
      poll_advisory_lock(&mut self.connection, statement, &name).await?;
    }
    Ok(())
  }

  /// Unlocks object then workspace and closes the session. The server ends
  /// the locks of a closed session even when an unlock failed.
  pub(crate) async fn release(mut self) {
    let unlocked = async {
      sqlx::query("SELECT pg_advisory_unlock(hashtextextended($1,0))")
        .bind(&self.object_key)
        .execute(&mut self.connection)
        .await?;
      sqlx::query("SELECT pg_advisory_unlock_shared(hashtextextended($1,0))")
        .bind(&self.workspace_key)
        .execute(&mut self.connection)
        .await?;
      Ok::<_, sqlx::Error>(())
    }
    .await;
    if let Err(error) = unlocked {
      tracing::warn!(error = %error, object_key = %self.object_key, "failed to release storage lifecycle lock");
    }
    if let Err(error) = self.connection.close().await {
      tracing::debug!(error = %error, "storage lock session did not close cleanly");
    }
  }
}

async fn poll_advisory_lock(conn: &mut PgConnection, statement: &str, name: &str) -> Result<(), DomainError> {
  while !sqlx::query_scalar::<_, bool>(statement)
    .bind(name)
    .fetch_one(&mut *conn)
    .await
    .map_err(db_error("take storage lifecycle lock"))?
  {
    tokio::time::sleep(STORAGE_LOCK_POLL).await;
  }
  Ok(())
}

/// Exclusive workspace-wide session lock (`storage-workspace:<workspace_id>`)
/// that serializes whole-workspace cleanup against shared object operations
/// (`StorageObjectLock`).
pub(crate) struct StorageWorkspaceLock {
  connection: PgConnection,
  workspace_key: String,
  _permit: OwnedSemaphorePermit,
}

impl StorageWorkspaceLock {
  pub(crate) async fn acquire(
    db: &ServerDb,
    permits: &Arc<Semaphore>,
    workspace_id: &str,
  ) -> Result<Self, DomainError> {
    let deadline = tokio::time::Instant::now() + STORAGE_LOCK_TIMEOUT;
    let timed_out = || DomainError::Unavailable("storage_lifecycle_lock_timeout".into());
    let (permit, connection) = tokio::time::timeout_at(deadline, async {
      let permit = Arc::clone(permits)
        .acquire_owned()
        .await
        .map_err(|_| DomainError::Unavailable("storage lock permits closed".into()))?;
      let connection = db
        .dedicated_session_conn()
        .await
        .map_err(|err| DomainError::Unavailable(format!("storage lock session: {err}")))?;
      Ok::<_, DomainError>((permit, connection))
    })
    .await
    .map_err(|_| timed_out())??;
    let mut lock = Self {
      connection,
      workspace_key: format!("storage-workspace:{workspace_id}"),
      _permit: permit,
    };
    let locked = tokio::time::timeout_at(
      deadline,
      poll_advisory_lock(
        &mut lock.connection,
        "SELECT pg_try_advisory_lock(hashtextextended($1,0))",
        &lock.workspace_key,
      ),
    )
    .await;
    match locked {
      Ok(Ok(())) => Ok(lock),
      Ok(Err(err)) => {
        let _ = lock.connection.close().await;
        Err(err)
      }
      Err(_) => {
        let _ = lock.connection.close().await;
        Err(timed_out())
      }
    }
  }

  pub(crate) async fn release(mut self) {
    if let Err(error) = sqlx::query("SELECT pg_advisory_unlock(hashtextextended($1,0))")
      .bind(&self.workspace_key)
      .execute(&mut self.connection)
      .await
    {
      tracing::warn!(error = %error, workspace_key = %self.workspace_key, "failed to release storage workspace lock");
    }
    if let Err(error) = self.connection.close().await {
      tracing::debug!(error = %error, "storage workspace lock session did not close cleanly");
    }
  }
}

pub struct BlobService {
  pub(crate) db: ServerDb,
  pub(crate) boot_storage: Arc<dyn BlobStorageBackend>,
  pub(crate) dynamic_storage: Arc<DynamicBlobStorage>,
  storage: Arc<dyn BlobStorageBackend>,
  quota: Arc<dyn QuotaGate>,
  pub(crate) invalidation: Option<Arc<dyn server_domain::events::InvalidationPublisher>>,
  pub(crate) lock_permits: Arc<Semaphore>,
  ref_cache: Arc<std::sync::Mutex<refs::BlobRefCache>>,
}

impl BlobService {
  pub fn new(db: ServerDb, storage: Arc<dyn BlobStorageBackend>, quota: Arc<dyn QuotaGate>) -> Self {
    let boot_storage = Arc::clone(&storage);
    let dynamic_storage = Arc::new(DynamicBlobStorage::new(storage));
    let storage: Arc<dyn BlobStorageBackend> = dynamic_storage.clone();
    Self {
      db,
      boot_storage,
      dynamic_storage,
      storage,
      quota,
      invalidation: None,
      lock_permits: Arc::new(Semaphore::new(DEFAULT_STORAGE_LOCK_CONCURRENCY)),
      ref_cache: Arc::new(std::sync::Mutex::new(refs::BlobRefCache::new())),
    }
  }

  pub fn with_invalidation(mut self, invalidation: Arc<dyn server_domain::events::InvalidationPublisher>) -> Self {
    self.invalidation = Some(invalidation);
    self
  }

  pub fn dynamic_storage(&self) -> &Arc<DynamicBlobStorage> {
    &self.dynamic_storage
  }

  /// Caps the dedicated lock sessions this service opens at once (default
  /// [`DEFAULT_STORAGE_LOCK_CONCURRENCY`]); waiting for a permit counts
  /// toward the 5 s lock budget.
  pub fn with_lock_concurrency(mut self, sessions: usize) -> Self {
    self.lock_permits = Arc::new(Semaphore::new(sessions));
    self
  }

  pub fn storage(&self) -> &Arc<dyn BlobStorageBackend> {
    &self.storage
  }

  /// Stores a blob and records it, enforcing the workspace grant (a 0-seat or
  /// expired grant and a blob above the per-blob limit are `blob_limit`, usage
  /// above the quota is `storage_quota`). Re-uploading the same bytes is a
  /// no-op; different bytes, size or mime under a live key, a deleted key and
  /// a key with a live pending upload are conflicts, and never overwrite the
  /// stored object.
  pub async fn put_blob(
    &self,
    workspace_id: &str,
    key: &str,
    mime: &str,
    body: Vec<u8>,
  ) -> Result<PutBlobOutcome, DomainError> {
    let object_key = blob_object_key(workspace_id, key)?;
    let size = i64::try_from(body.len()).map_err(|_| DomainError::Validation("blob too large".into()))?;
    if size > i64::from(i32::MAX) {
      return Err(DomainError::QuotaExceeded {
        kind: "blob_limit",
        message: format!("blob of {size} bytes exceeds the database size range"),
      });
    }

    let lock = StorageObjectLock::acquire(&self.db, &self.lock_permits, workspace_id, &object_key).await?;
    let result = self.put_locked(workspace_id, key, &object_key, mime, size, body).await;
    lock.release().await;
    result
  }

  async fn put_locked(
    &self,
    workspace_id: &str,
    key: &str,
    object_key: &str,
    mime: &str,
    size: i64,
    body: Vec<u8>,
  ) -> Result<PutBlobOutcome, DomainError> {
    let admission = {
      let mut tx = self.begin_write().await?;
      match self.reserve(tx.tx_mut(), workspace_id, key, mime, size).await {
        Ok(admission) => {
          tx.commit()
            .await
            .map_err(|err| DomainError::Internal(err.to_string()))?;
          admission
        }
        Err(err) => {
          let _ = tx.rollback().await;
          return Err(err);
        }
      }
    };
    let reservation_id = match admission {
      Admission::Existing(record) => return self.confirm_existing(object_key, record, &body).await,
      Admission::Reserved(reservation_id) => reservation_id,
    };

    if let Err(err) = self.storage.put(object_key, body, mime).await {
      self.abandon_reservation(workspace_id, key, &reservation_id).await;
      return Err(storage_error(err));
    }
    match self.complete_reservation(workspace_id, key, &reservation_id).await {
      Ok(Some(created_at)) => Ok(PutBlobOutcome::Created(BlobRecord {
        workspace_id: workspace_id.to_owned(),
        key: key.to_owned(),
        size,
        mime: mime.to_owned(),
        created_at,
      })),
      Ok(None) => {
        self.abandon_reservation(workspace_id, key, &reservation_id).await;
        Err(DomainError::Conflict("storage reservation changed".into()))
      }
      Err(err) => {
        self.abandon_reservation(workspace_id, key, &reservation_id).await;
        Err(err)
      }
    }
  }

  /// The live blob's row and bytes, or `None` when it is missing, deleted,
  /// pending or its object is gone.
  pub async fn get_blob(&self, workspace_id: &str, key: &str) -> Result<Option<(BlobRecord, Vec<u8>)>, DomainError> {
    let object_key = blob_object_key(workspace_id, key)?;
    let record = {
      let mut conn = self
        .db
        .acquire_tiered(WorkloadTier::InteractiveRead)
        .await
        .map_err(|err| DomainError::Unavailable(err.to_string()))?;
      sqlx::query(
        "SELECT size::bigint AS size, mime, created_at FROM blobs WHERE workspace_id=$1 AND key=$2 AND \
         status='completed' AND deleted_at IS NULL",
      )
      .bind(workspace_id)
      .bind(key)
      .fetch_optional(conn.as_conn())
      .await
      .map_err(db_error("load blob"))?
      .map(|row| BlobRecord {
        workspace_id: workspace_id.to_owned(),
        key: key.to_owned(),
        size: row.get("size"),
        mime: row.get("mime"),
        created_at: row.get("created_at"),
      })
    };
    let Some(record) = record else {
      return Ok(None);
    };
    let object = self.storage.get(&object_key).await.map_err(storage_error)?;
    Ok(object.map(|(body, _)| (record, body)))
  }

  /// Checks `Workspace.Blobs.Manage` inside a single read transaction (used by
  /// no-op paths such as empty-key `deleteBlob` that must still enforce authz).
  pub async fn check_blobs_manage(&self, actor_user_id: &str, workspace_id: &str) -> Result<(), DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|err| DomainError::Unavailable(err.to_string()))?;
    assert_blobs_manage_in_tx(tx.tx_mut(), self.quota.as_ref(), actor_user_id, workspace_id, false).await?;
    let _ = tx.rollback().await;
    Ok(())
  }

  /// Live blobs of a workspace, ordered by key ascending for monotonic cursor
  /// pagination, enforcing active `Owner` or commercial `Admin` + non-disabled
  /// actor inside the same read transaction (`strict_quota/management.rs`).
  pub async fn list_blobs_authorized(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
  ) -> Result<Vec<BlobRecord>, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|err| DomainError::Unavailable(err.to_string()))?;
    assert_blobs_manage_in_tx(tx.tx_mut(), self.quota.as_ref(), actor_user_id, workspace_id, false).await?;
    let rows = sqlx::query(
      "SELECT key, size::bigint AS size, mime, created_at FROM blobs WHERE workspace_id=$1 AND \
       status='completed' AND deleted_at IS NULL ORDER BY key ASC",
    )
    .bind(workspace_id)
    .fetch_all(&mut **tx.tx_mut())
    .await
    .map_err(db_error("list blobs"))?;
    let _ = tx.rollback().await;
    Ok(
      rows
        .into_iter()
        .map(|row| BlobRecord {
          workspace_id: workspace_id.to_owned(),
          key: row.get("key"),
          size: row.get("size"),
          mime: row.get("mime"),
          created_at: row.get("created_at"),
        })
        .collect(),
    )
  }

  /// Soft- or permanently deletes a blob while verifying active `Owner` or
  /// commercial `Admin` (`Workspace.Blobs.Manage`) under row locks (`users` ->
  /// `workspaces`) inside the same mutation transaction, eliminating TOCTOU windows.
  pub async fn delete_blob_authorized(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    key: &str,
    permanently: bool,
  ) -> Result<bool, DomainError> {
    let object_key = blob_object_key(workspace_id, key)?;
    let lock = StorageObjectLock::acquire(&self.db, &self.lock_permits, workspace_id, &object_key).await?;
    let result = async {
      let mut tx = self.begin_write().await?;
      assert_blobs_manage_in_tx(tx.tx_mut(), self.quota.as_ref(), actor_user_id, workspace_id, true).await?;
      let marked = if permanently {
        sqlx::query_scalar::<_, Option<String>>(
          "UPDATE blobs SET deleted_at=COALESCE(deleted_at, clock_timestamp()) WHERE workspace_id=$1 AND key=$2 AND \
           status='completed' RETURNING reservation_id::text",
        )
      } else {
        sqlx::query_scalar::<_, Option<String>>(
          "UPDATE blobs SET deleted_at=clock_timestamp() WHERE workspace_id=$1 AND key=$2 AND status='completed' AND \
           deleted_at IS NULL RETURNING reservation_id::text",
        )
      }
      .bind(workspace_id)
      .bind(key)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(db_error("delete blob"))?;
      tx.commit()
        .await
        .map_err(|err| DomainError::Internal(err.to_string()))?;

      let Some(reservation_id) = marked else {
        return Ok(false);
      };
      if permanently {
        self.storage.delete(&object_key).await.map_err(storage_error)?;
        self
          .delete_released_row(workspace_id, key, reservation_id.as_deref())
          .await?;
      }
      Ok(true)
    }
    .await;
    lock.release().await;
    result
  }

  /// Releases all soft-deleted blobs of a workspace while verifying active
  /// `Owner` or commercial `Admin` (`Workspace.Blobs.Manage`) under row locks
  /// (`users` -> `workspaces`) both when selecting candidates and again after
  /// acquiring each [`StorageObjectLock`].
  pub async fn release_deleted_blobs_authorized(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
  ) -> Result<usize, DomainError> {
    validate_blob_key(workspace_id)?;
    let candidates: Vec<String> = {
      let mut tx = self.begin_write().await?;
      assert_blobs_manage_in_tx(tx.tx_mut(), self.quota.as_ref(), actor_user_id, workspace_id, true).await?;
      let rows = sqlx::query_scalar(
        "SELECT key FROM blobs WHERE workspace_id=$1 AND status='completed' AND deleted_at IS NOT NULL ORDER BY key",
      )
      .bind(workspace_id)
      .fetch_all(&mut **tx.tx_mut())
      .await
      .map_err(db_error("list deleted blobs"))?;
      tx.commit()
        .await
        .map_err(|err| DomainError::Internal(err.to_string()))?;
      rows
    };
    let mut released = 0;
    for key in candidates {
      let object_key = blob_object_key(workspace_id, &key)?;
      let lock = StorageObjectLock::acquire(&self.db, &self.lock_permits, workspace_id, &object_key).await?;
      let result = async {
        {
          let mut tx = self.begin_write().await?;
          assert_blobs_manage_in_tx(tx.tx_mut(), self.quota.as_ref(), actor_user_id, workspace_id, true).await?;
          tx.commit()
            .await
            .map_err(|err| DomainError::Internal(err.to_string()))?;
        }
        self.release_locked(workspace_id, &key, &object_key).await
      }
      .await;
      lock.release().await;
      if result? {
        released += 1;
      }
    }
    Ok(released)
  }

  /// Live blobs of a workspace, ordered by key ascending for monotonic cursor pagination.
  pub async fn list_blobs(&self, workspace_id: &str) -> Result<Vec<BlobRecord>, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|err| DomainError::Unavailable(err.to_string()))?;
    let rows = sqlx::query(
      "SELECT key, size::bigint AS size, mime, created_at FROM blobs WHERE workspace_id=$1 AND \
       status='completed' AND deleted_at IS NULL ORDER BY key ASC",
    )
    .bind(workspace_id)
    .fetch_all(conn.as_conn())
    .await
    .map_err(db_error("list blobs"))?;
    Ok(
      rows
        .into_iter()
        .map(|row| BlobRecord {
          workspace_id: workspace_id.to_owned(),
          key: row.get("key"),
          size: row.get("size"),
          mime: row.get("mime"),
          created_at: row.get("created_at"),
        })
        .collect(),
    )
  }

  /// Soft-deletes a completed blob (`deleted_at`). With `permanently` the row
  /// stays soft-deleted, which keeps the key unusable, until the object is
  /// deleted; then the row is removed if it still carries the same
  /// `reservation_id`. A failed object delete leaves the soft-deleted row for
  /// a retry or [`BlobService::release_deleted_blobs`]. Returns whether a
  /// blob was affected.
  pub async fn delete_blob(&self, workspace_id: &str, key: &str, permanently: bool) -> Result<bool, DomainError> {
    let object_key = blob_object_key(workspace_id, key)?;
    if !permanently {
      return self
        .mark_deleted(workspace_id, key, false)
        .await
        .map(|marked| marked.is_some());
    }
    let lock = StorageObjectLock::acquire(&self.db, &self.lock_permits, workspace_id, &object_key).await?;
    let result = async {
      let Some(reservation_id) = self.mark_deleted(workspace_id, key, true).await? else {
        return Ok(false);
      };
      self.storage.delete(&object_key).await.map_err(storage_error)?;
      self
        .delete_released_row(workspace_id, key, reservation_id.as_deref())
        .await?;
      Ok(true)
    }
    .await;
    lock.release().await;
    result
  }

  /// Marks the completed row deleted and returns its `reservation_id`
  /// (`Some(None)` for a legacy row without one); `None` when no row matched.
  /// `again` also matches an already soft-deleted row.
  async fn mark_deleted(
    &self,
    workspace_id: &str,
    key: &str,
    again: bool,
  ) -> Result<Option<Option<String>>, DomainError> {
    let mut tx = self.begin_write().await?;
    let marked = if again {
      sqlx::query_scalar::<_, Option<String>>(
        "UPDATE blobs SET deleted_at=COALESCE(deleted_at, clock_timestamp()) WHERE workspace_id=$1 AND key=$2 AND \
         status='completed' RETURNING reservation_id::text",
      )
    } else {
      sqlx::query_scalar::<_, Option<String>>(
        "UPDATE blobs SET deleted_at=clock_timestamp() WHERE workspace_id=$1 AND key=$2 AND status='completed' AND \
         deleted_at IS NULL RETURNING reservation_id::text",
      )
    }
    .bind(workspace_id)
    .bind(key)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(db_error("delete blob"))?;
    tx.commit()
      .await
      .map_err(|err| DomainError::Internal(err.to_string()))?;
    Ok(marked)
  }

  /// Permanently removes every soft-deleted completed blob of a workspace.
  /// Each key is re-read under its storage lock: only a row that is still
  /// soft-deleted has its object deleted, then the row is removed if it still
  /// carries the same `reservation_id`. A key revived by a new upload in the
  /// meantime is left alone. Returns the number of rows removed.
  pub async fn release_deleted_blobs(&self, workspace_id: &str) -> Result<usize, DomainError> {
    validate_blob_key(workspace_id)?;
    let candidates: Vec<String> = {
      let mut conn = self
        .db
        .acquire_tiered(WorkloadTier::InteractiveRead)
        .await
        .map_err(|err| DomainError::Unavailable(err.to_string()))?;
      sqlx::query_scalar(
        "SELECT key FROM blobs WHERE workspace_id=$1 AND status='completed' AND deleted_at IS NOT NULL ORDER BY key",
      )
      .bind(workspace_id)
      .fetch_all(conn.as_conn())
      .await
      .map_err(db_error("list deleted blobs"))?
    };
    let mut released = 0;
    for key in candidates {
      let object_key = blob_object_key(workspace_id, &key)?;
      let lock = StorageObjectLock::acquire(&self.db, &self.lock_permits, workspace_id, &object_key).await?;
      let result = self.release_locked(workspace_id, &key, &object_key).await;
      lock.release().await;
      if result? {
        released += 1;
      }
    }
    Ok(released)
  }

  async fn release_locked(&self, workspace_id: &str, key: &str, object_key: &str) -> Result<bool, DomainError> {
    let current: Option<Option<String>> = {
      let mut conn = self
        .db
        .acquire_tiered(WorkloadTier::InteractiveRead)
        .await
        .map_err(|err| DomainError::Unavailable(err.to_string()))?;
      sqlx::query_scalar(
        "SELECT reservation_id::text FROM blobs WHERE workspace_id=$1 AND key=$2 AND status='completed' AND \
         deleted_at IS NOT NULL",
      )
      .bind(workspace_id)
      .bind(key)
      .fetch_optional(conn.as_conn())
      .await
      .map_err(db_error("re-read deleted blob"))?
    };
    let Some(reservation_id) = current else {
      return Ok(false);
    };
    self.storage.delete(object_key).await.map_err(storage_error)?;
    self
      .delete_released_row(workspace_id, key, reservation_id.as_deref())
      .await
  }

  async fn delete_released_row(
    &self,
    workspace_id: &str,
    key: &str,
    reservation_id: Option<&str>,
  ) -> Result<bool, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|err| DomainError::Unavailable(err.to_string()))?;
    let removed = sqlx::query(
      "DELETE FROM blobs WHERE workspace_id=$1 AND key=$2 AND status='completed' AND deleted_at IS NOT NULL AND \
       reservation_id IS NOT DISTINCT FROM $3::uuid",
    )
    .bind(workspace_id)
    .bind(key)
    .bind(reservation_id)
    .execute(conn.as_conn())
    .await
    .map_err(db_error("release deleted blob"))?
    .rows_affected();
    Ok(removed == 1)
  }

  pub(crate) async fn begin_write(&self) -> Result<server_db::TieredTx<'_>, DomainError> {
    self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|err| DomainError::Unavailable(err.to_string()))
  }

  /// A live completed row with the same size and mime is the same blob only
  /// if the stored object has the same bytes: a differing CRC32 in the object
  /// metadata rejects at once, otherwise the stored bytes are compared.
  async fn confirm_existing(
    &self,
    object_key: &str,
    record: BlobRecord,
    body: &[u8],
  ) -> Result<PutBlobOutcome, DomainError> {
    let Some(metadata) = self.storage.head(object_key).await.map_err(storage_error)? else {
      return Err(DomainError::Conflict("blob object is missing".into()));
    };
    let checksum_differs = metadata
      .checksum_crc32
      .is_some_and(|checksum| checksum != checksum_crc32_base64(body));
    let same = !checksum_differs
      && self
        .storage
        .get(object_key)
        .await
        .map_err(storage_error)?
        .is_some_and(|(stored, _)| stored == body);
    if same {
      Ok(PutBlobOutcome::AlreadyExists(record))
    } else {
      Err(DomainError::Conflict("blob content mismatch".into()))
    }
  }

  /// Locks the workspace owner (`users`), then the workspace row (`workspaces`),
  /// re-verifies the active owner (matching `strict_quota/authorization.rs`),
  /// classifies the ledger row, checks the grant and seat/storage quotas using
  /// PostgreSQL `clock_timestamp()`, and records or resumes a pending reservation.
  pub(crate) async fn reserve(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    key: &str,
    mime: &str,
    size: i64,
  ) -> Result<Admission, DomainError> {
    let owner_id: Option<String> = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
    )
    .bind(workspace_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error("load workspace quota owner"))?;
    if let Some(ref oid) = owner_id {
      sqlx::query("SELECT id FROM users WHERE id = $1 FOR UPDATE")
        .bind(oid)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error("lock quota owner"))?;
    }
    let locked: Option<String> = sqlx::query_scalar("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE")
      .bind(workspace_id)
      .fetch_optional(&mut **tx)
      .await
      .map_err(db_error("lock workspace"))?;
    if locked.is_none() {
      return Err(DomainError::NotFound(format!("workspace {workspace_id}")));
    }
    let locked_owner_id: Option<String> = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
    )
    .bind(workspace_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error("verify storage quota owner"))?;
    if locked_owner_id != owner_id {
      return Err(DomainError::Conflict("storage_quota_subject_changed".into()));
    }

    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx)
      .await
      .map_err(db_error("load db clock for quota"))?;

    let existing = sqlx::query(
      "SELECT size::bigint AS size, mime, status::text AS status, created_at, deleted_at IS NOT NULL AS deleted, \
       reservation_id::text AS reservation_id, upload_id, \
       COALESCE(reservation_expires_at > $3, false) AS live_reservation FROM blobs WHERE \
       workspace_id=$1 AND key=$2 FOR UPDATE",
    )
    .bind(workspace_id)
    .bind(key)
    .bind(now)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error("load blob ledger row"))?;
    let mut resumable_reservation_id: Option<String> = None;
    if let Some(row) = existing {
      let status: String = row.get("status");
      let deleted: bool = row.get("deleted");
      match status.as_str() {
        "completed" if deleted => return Err(DomainError::Conflict("storage key is deleted".into())),
        "completed" => {
          let existing_size: i64 = row.get("size");
          let existing_mime: String = row.get("mime");
          if existing_size != size {
            return Err(DomainError::Conflict("blob size mismatch".into()));
          }
          if existing_mime != mime {
            return Err(DomainError::Conflict("blob mime mismatch".into()));
          }
          return Ok(Admission::Existing(BlobRecord {
            workspace_id: workspace_id.to_owned(),
            key: key.to_owned(),
            size,
            mime: existing_mime,
            created_at: row.get("created_at"),
          }));
        }
        "pending" if !deleted && row.get::<bool, _>("live_reservation") => {
          let existing_size: i64 = row.get("size");
          let existing_mime: String = row.get("mime");
          let upload_id: Option<String> = row.get("upload_id");
          let reservation_id: Option<String> = row.get("reservation_id");
          if upload_id.is_none()
            && existing_size == size
            && existing_mime == mime
            && let Some(rid) = reservation_id
          {
            resumable_reservation_id = Some(rid);
          } else {
            return Err(DomainError::Conflict("blob upload is pending".into()));
          }
        }
        "pending" => {}
        other => return Err(DomainError::Conflict(format!("storage key is not reusable ({other})"))),
      }
    }

    let grant = self.quota.resolve_workspace_grant(tx, workspace_id, now).await?;
    let charged_seats: i64 = sqlx::query_scalar(
      r#"SELECT
        (SELECT count(*) FROM workspace_members WHERE workspace_id=$1 AND state='active')
        + (SELECT count(*) FROM workspace_invitations WHERE workspace_id=$1
          AND status::text = ANY($2))"#,
    )
    .bind(workspace_id)
    .bind(server_domain::workspaces::CHARGEABLE_INVITATION_STATUSES.as_slice())
    .fetch_one(&mut **tx)
    .await
    .map_err(db_error("load strict storage seat usage"))?;
    if grant.limits.seat_limit <= 0
      || charged_seats > i64::from(grant.limits.seat_limit)
      || grant.expires_at.is_some_and(|expires_at| now >= expires_at)
    {
      return Err(DomainError::QuotaExceeded {
        kind: "storage_quota",
        message: "workspace is in fail-closed readonly state".into(),
      });
    }
    if size > grant.limits.blob_limit_bytes {
      return Err(DomainError::QuotaExceeded {
        kind: "blob_limit",
        message: format!(
          "blob of {size} bytes exceeds the {} byte limit",
          grant.limits.blob_limit_bytes
        ),
      });
    }
    if let Some(rid) = resumable_reservation_id {
      return Ok(Admission::Reserved(rid));
    }
    let charged_workspaces: Vec<String> = if grant.billing_subject == server_types::BillingSubject::Workspace {
      vec![workspace_id.to_owned()]
    } else {
      let mut list = vec![workspace_id.to_owned()];
      if let Some(owner_id) = locked_owner_id {
        let owned: Vec<(String, bool)> = sqlx::query_as(
          r#"SELECT
               wm.workspace_id,
               (
                 EXISTS (
                   SELECT 1
                   FROM entitlements e
                   WHERE e.target_type = 'workspace'
                     AND e.target_id = wm.workspace_id
                     AND e.status IN ('active', 'grace')
                     AND (e.starts_at IS NULL OR e.starts_at <= $2)
                     AND (e.expires_at IS NULL OR e.expires_at > $2 OR e.grace_until > $2)
                 )
                 OR EXISTS (
                   SELECT 1
                   FROM installed_licenses il
                   WHERE il.workspace_id = wm.workspace_id
                 )
               ) AS has_candidate_entitlement
             FROM workspace_members wm
             WHERE wm.user_id = $1
               AND wm.role = 'owner'
               AND wm.state = 'active'
             ORDER BY wm.workspace_id"#,
        )
        .bind(&owner_id)
        .bind(now)
        .fetch_all(&mut **tx)
        .await
        .map_err(db_error("load owner workspaces for quota"))?;
        for (wid, has_candidate_entitlement) in owned {
          if wid == workspace_id {
            continue;
          }
          if !has_candidate_entitlement {
            list.push(wid);
            continue;
          }
          let other_grant = self.quota.resolve_workspace_grant(tx, &wid, now).await?;
          if other_grant.billing_subject == server_types::BillingSubject::Owner {
            list.push(wid);
          }
        }
      }
      list
    };
    let used: i64 = sqlx::query_scalar(
      r#"SELECT
        COALESCE((SELECT SUM(size)::bigint FROM blobs WHERE workspace_id=ANY($1) AND deleted_at IS NULL
          AND (status='completed' OR (status='pending' AND reservation_expires_at > $2))),0)
        + COALESCE((SELECT SUM(size)::bigint FROM comment_attachments WHERE workspace_id=ANY($1) AND deleted_at IS NULL
          AND (status='completed' OR (status='pending' AND reservation_expires_at > $2))),0)"#,
    )
    .bind(&charged_workspaces)
    .bind(now)
    .fetch_one(&mut **tx)
    .await
    .map_err(db_error("load workspace storage usage"))?;
    if used
      .checked_add(size)
      .is_none_or(|projected| projected > grant.limits.storage_quota_bytes)
    {
      return Err(DomainError::QuotaExceeded {
        kind: "storage_quota",
        message: format!(
          "workspace storage quota exceeded: {used} + {size} > {}",
          grant.limits.storage_quota_bytes
        ),
      });
    }

    let size_i32 =
      i32::try_from(size).map_err(|_| DomainError::Validation("blob size exceeds database range".into()))?;
    let reservation_id: String = sqlx::query_scalar(
      r#"INSERT INTO blobs
           (workspace_id, key, size, mime, status, reservation_id, reservation_expires_at, upload_id, deleted_at,
            created_at)
         VALUES ($1, $2, $3, $4, 'pending', gen_random_uuid(), $6 + make_interval(mins => $5), NULL,
           NULL, CURRENT_TIMESTAMP)
         ON CONFLICT (workspace_id, key) DO UPDATE SET
           size = EXCLUDED.size, mime = EXCLUDED.mime, status = 'pending', reservation_id = EXCLUDED.reservation_id,
           reservation_expires_at = EXCLUDED.reservation_expires_at, upload_id = NULL, deleted_at = NULL,
           created_at = EXCLUDED.created_at
         WHERE blobs.status = 'pending'
         RETURNING reservation_id::text"#,
    )
    .bind(workspace_id)
    .bind(key)
    .bind(size_i32)
    .bind(mime)
    .bind(STORAGE_RESERVATION_MINUTES)
    .bind(now)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error("reserve blob"))?
    .ok_or_else(|| DomainError::Conflict("storage reservation changed".into()))?;
    Ok(Admission::Reserved(reservation_id))
  }

  /// Turns this upload's own live reservation into a completed row; `None`
  /// when the reservation expired or was replaced.
  pub(crate) async fn complete_reservation(
    &self,
    workspace_id: &str,
    key: &str,
    reservation_id: &str,
  ) -> Result<Option<DateTime<Utc>>, DomainError> {
    let mut tx = self.begin_write().await?;
    let completed: Option<DateTime<Utc>> = sqlx::query_scalar(
      "UPDATE blobs SET status='completed', reservation_expires_at=NULL WHERE workspace_id=$1 AND key=$2 AND \
       status='pending' AND deleted_at IS NULL AND reservation_id=$3::uuid AND reservation_expires_at > \
       clock_timestamp() RETURNING created_at",
    )
    .bind(workspace_id)
    .bind(key)
    .bind(reservation_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(db_error("complete blob reservation"))?;
    tx.commit()
      .await
      .map_err(|err| DomainError::Internal(err.to_string()))?;
    Ok(completed)
  }

  /// Removes this upload's object and pending row, only while the row still
  /// carries its `reservation_id`. Runs under the object's storage lock, so
  /// the object is deleted outside any transaction and the row afterwards; if
  /// the object cannot be deleted the row is kept and expires.
  async fn abandon_reservation(&self, workspace_id: &str, key: &str, reservation_id: &str) {
    let result: Result<(), String> = async {
      let object_key = blob_object_key(workspace_id, key).map_err(|err| err.to_string())?;
      let mut conn = self
        .db
        .acquire_tiered(WorkloadTier::InteractiveWrite)
        .await
        .map_err(|err| err.to_string())?;
      let owned: Option<i32> = sqlx::query_scalar(
        "SELECT 1 FROM blobs WHERE workspace_id=$1 AND key=$2 AND status='pending' AND reservation_id=$3::uuid",
      )
      .bind(workspace_id)
      .bind(key)
      .bind(reservation_id)
      .fetch_optional(conn.as_conn())
      .await
      .map_err(|err| err.to_string())?;
      if owned.is_none() {
        return Ok(());
      }
      self.storage.delete(&object_key).await.map_err(|err| err.to_string())?;
      sqlx::query(
        "DELETE FROM blobs WHERE workspace_id=$1 AND key=$2 AND status='pending' AND reservation_id=$3::uuid",
      )
      .bind(workspace_id)
      .bind(key)
      .bind(reservation_id)
      .execute(conn.as_conn())
      .await
      .map_err(|err| err.to_string())?;
      Ok(())
    }
    .await;
    if let Err(error) = result {
      tracing::warn!(workspace_id, key, error = %error, "failed to abandon blob upload reservation");
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn blob_keys_and_object_locators_reject_traversal_and_reserved_names() {
    for (key, valid) in [
      ("Ab3_-=.png", true),
      ("x", true),
      ("metadata.json", true),
      ("a.tmp", true),
      ("", false),
      (".", false),
      ("..", false),
      ("a/b", false),
      ("..\\x", false),
      ("a\0b", false),
      ("a\nb", false),
      ("foo.metadata.json", false),
      ("FOO.Metadata.JSON", false),
      ("foo.tmp-1234", true),
      ("foo.TMP-1234", true),
      ("abc%20def", false),
    ] {
      assert_eq!(validate_blob_key(key).is_ok(), valid, "{key:?}");
    }
    assert!(validate_blob_key(&"k".repeat(MAX_BLOB_KEY_BYTES)).is_ok());
    assert!(validate_blob_key(&"k".repeat(MAX_BLOB_KEY_BYTES + 1)).is_err());
    assert_eq!(blob_object_key("ws", "key").unwrap(), "ws/key");
    assert!(blob_object_key("../ws", "key").is_err());
    for (key, valid) in [
      ("ws/blob", true),
      ("ws\\blob", true),
      ("", false),
      ("/a", false),
      ("a//b", false),
      ("a/./b", false),
      ("a/../b", false),
      ("ws/foo.metadata.json", false),
      ("ws.tmp-1/foo", true),
    ] {
      assert_eq!(normalize_storage_key(key).is_ok(), valid, "{key:?}");
    }
  }

  #[test]
  fn storage_failures_reach_callers_only_as_a_fixed_message() {
    let leaky = StorageError::Request {
      context: "put ws/key".into(),
      message: "https://s3.test/b/ws/key?X-Amz-Credential=AKID&X-Amz-Signature=abc&X-Amz-Security-Token=t".into(),
    };
    let surfaced = storage_error(leaky).to_string();
    assert_eq!(surfaced, "unavailable: blob storage unavailable");
    assert!(matches!(
      storage_error(StorageError::InvalidKey("a/../b".into())),
      DomainError::Validation(_)
    ));
  }
}
