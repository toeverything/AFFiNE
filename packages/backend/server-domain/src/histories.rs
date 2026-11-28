//! Document snapshot history listing, binary retrieval, collision-safe
//! recovery, background doc update compaction, and expired record housekeeping.

use std::collections::HashMap;
use std::future::Future;
use std::sync::{Arc, Mutex, OnceLock};

use chrono::{DateTime, Duration, Utc};
use server_db::{ServerDb, WorkloadTier};
use server_spi::QuotaGate;
use server_types::DomainError;
use sha2::{Digest as _, Sha256};
use sqlx::{Postgres, Row, Transaction};
use tokio::sync::Semaphore;

use crate::acl::load_workspace_docs_access_in;
use crate::doc_meta::{ParsedDocMeta, apply_parsed_doc_metadata_in, parse_doc_metadata};
use crate::doc_sharing::{DocSharingService, is_empty_doc_bin};

#[derive(Clone, Debug)]
pub struct DocHistoryView {
  pub workspace_id: String,
  pub id: String,
  pub timestamp: DateTime<Utc>,
  pub editor_name: Option<String>,
  pub editor_avatar_url: Option<String>,
}

#[derive(Clone)]
pub struct DocHistoryService {
  db: ServerDb,
  quota_gate: Arc<dyn QuotaGate>,
  doc_sharing: DocSharingService,
}

impl DocHistoryService {
  pub fn new(db: ServerDb, quota_gate: Arc<dyn QuotaGate>, doc_sharing: DocSharingService) -> Self {
    Self {
      db,
      quota_gate,
      doc_sharing,
    }
  }

  pub async fn list_histories(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    raw_doc_id: &str,
    before: DateTime<Utc>,
    take: Option<i32>,
  ) -> Result<Vec<DocHistoryView>, DomainError> {
    let doc_id = self
      .doc_sharing
      .resolve_storage_doc_id(workspace_id, raw_doc_id)
      .await?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin list_histories: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("list_histories clock: {e}")))?;

    let access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      std::slice::from_ref(&doc_id),
      now,
    )
    .await?;
    if !access.docs.get(&doc_id).is_some_and(|e| e.permissions.doc_history_read) {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.History.Read"
      )));
    }

    let limit = i64::from(take.unwrap_or(100).clamp(1, 100));
    let rows = sqlx::query(
      r#"SELECT sh.timestamp, u.name AS editor_name, u.avatar_url AS editor_avatar_url
         FROM snapshot_histories sh
         LEFT JOIN users u ON u.id = sh.created_by
         WHERE sh.workspace_id = $1
           AND sh.guid = $2
           AND sh.timestamp < $3
         ORDER BY sh.timestamp DESC
         LIMIT $4"#,
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .bind(before)
    .bind(limit)
    .fetch_all(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("list snapshot histories: {e}")))?;
    let _ = tx.rollback().await;

    Ok(
      rows
        .into_iter()
        .map(|r| DocHistoryView {
          workspace_id: workspace_id.to_owned(),
          id: doc_id.clone(),
          timestamp: r.get("timestamp"),
          editor_name: r.get("editor_name"),
          editor_avatar_url: r.get("editor_avatar_url"),
        })
        .collect(),
    )
  }

  /// Fetches the raw binary snapshot for `GET /api/workspaces/:id/docs/:guid/histories/:timestamp`.
  /// Enforces `Workspace.Sync`, `Doc.Read`, and `Doc.History.Read` together.
  pub async fn get_history_binary(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    raw_doc_id: &str,
    timestamp: DateTime<Utc>,
  ) -> Result<Option<Vec<u8>>, DomainError> {
    let doc_id = self
      .doc_sharing
      .resolve_storage_doc_id(workspace_id, raw_doc_id)
      .await?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin get_history_binary: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("get_history_binary clock: {e}")))?;

    let access = match load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      std::slice::from_ref(&doc_id),
      now,
    )
    .await
    {
      Ok(a) => a,
      Err(DomainError::NotFound(_)) => {
        return Err(DomainError::Forbidden(format!(
          "doc_action_denied:{workspace_id}:{doc_id}:Doc.History.Read"
        )));
      }
      Err(e) => return Err(e),
    };
    let doc_ok = access
      .docs
      .get(&doc_id)
      .is_some_and(|e| e.permissions.doc_read && e.permissions.doc_history_read);
    if !access.workspace_permissions.sync || !doc_ok {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.History.Read"
      )));
    }

    let blob: Option<Vec<u8>> = sqlx::query_scalar(
      "SELECT blob FROM snapshot_histories WHERE workspace_id = $1 AND guid = $2 AND timestamp = $3",
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .bind(timestamp)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load snapshot history blob: {e}")))?;
    let _ = tx.rollback().await;
    Ok(blob)
  }

  /// Collision-safe `recoverDoc` matching `v0.27.5` `domain_command/history.rs:112` 1:1:
  /// archives the pre-recovery merged doc state into `snapshot_histories` without
  /// overwriting `snapshots` (the client applies the recovered history state via sync).
  pub async fn recover_doc(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    raw_doc_id: &str,
    timestamp: DateTime<Utc>,
  ) -> Result<DateTime<Utc>, DomainError> {
    let doc_id = self
      .doc_sharing
      .resolve_storage_doc_id(workspace_id, raw_doc_id)
      .await?;
    if workspace_id == doc_id {
      return Err(DomainError::Validation("doc_is_workspace".to_owned()));
    }

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin recover_doc: {e}")))?;

    // Acquire workspace storage shared lock (`storage-workspace:{workspace_id}`, matching
    // `server-sync/src/storage.rs` and `v0.27.5` `storage_lifecycle.rs:14`) then per-doc lock.
    sqlx::query("SELECT pg_advisory_xact_lock_shared(hashtextextended($1, 0))")
      .bind(format!("storage-workspace:{workspace_id}"))
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock workspace storage shared: {e}")))?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
      .bind(format!("workspace-doc-update:{workspace_id}/{doc_id}"))
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock workspace doc update: {e}")))?;

    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("recover_doc clock: {e}")))?;

    let access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      std::slice::from_ref(&doc_id),
      now,
    )
    .await?;
    let doc_ok = access
      .docs
      .get(&doc_id)
      .is_some_and(|e| e.permissions.doc_update && e.permissions.doc_history_read);
    if !doc_ok
      || DocSharingService::is_workspace_readonly_in(tx.tx_mut(), self.quota_gate.as_ref(), workspace_id, now).await?
    {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Update"
      )));
    }

    // Load current merged doc state (`snapshots` + `updates`).
    let snap: Option<(Vec<u8>, DateTime<Utc>)> =
      sqlx::query_as("SELECT blob, updated_at FROM snapshots WHERE workspace_id = $1 AND guid = $2")
        .bind(workspace_id)
        .bind(&doc_id)
        .fetch_optional(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("load current doc snapshot: {e}")))?;
    let updates: Vec<(Vec<u8>, DateTime<Utc>)> = sqlx::query_as(
      "SELECT blob, created_at FROM updates WHERE workspace_id = $1 AND guid = $2 ORDER BY created_at ASC",
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .fetch_all(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load current doc updates: {e}")))?;

    if snap.is_none() && updates.is_empty() {
      return Err(DomainError::NotFound(format!("doc_not_found:{workspace_id}:{doc_id}")));
    }
    let mut current_updated_at = snap
      .as_ref()
      .map(|(_, ts)| *ts)
      .unwrap_or_else(|| updates.last().expect("updates non-empty").1);
    if let Some((_, last_upd)) = updates.last()
      && *last_upd > current_updated_at
    {
      current_updated_at = *last_upd;
    }
    let mut parts = Vec::with_capacity(updates.len() + usize::from(snap.is_some()));
    if let Some((b, _)) = snap {
      parts.push(b);
    }
    parts.extend(updates.into_iter().map(|(b, _)| b));
    let current_blob = if parts.len() == 1 {
      parts.remove(0)
    } else {
      y_octo::merge_updates_v1(parts)
        .and_then(|u| u.encode_v1())
        .map_err(|e| DomainError::Internal(format!("merge current doc for recovery: {e}")))?
    };

    // Verify target history exists and lock it FOR UPDATE.
    let history = sqlx::query(
      "SELECT EXTRACT(EPOCH FROM expired_at - timestamp)::bigint AS retention \
       FROM snapshot_histories \
       WHERE workspace_id = $1 AND guid = $2 AND timestamp = $3 FOR UPDATE",
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .bind(timestamp)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load recovery history: {e}")))?
    .ok_or_else(|| {
      DomainError::NotFound(format!(
        "doc_history_not_found:{workspace_id}:{doc_id}:{}",
        timestamp.timestamp_millis()
      ))
    })?;
    let retention: i64 = history.get("retention");

    let existing: Option<Vec<u8>> = sqlx::query_scalar(
      "SELECT blob FROM snapshot_histories WHERE workspace_id = $1 AND guid = $2 AND timestamp = $3",
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .bind(current_updated_at)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load current recovery archive: {e}")))?;

    let archive_timestamp = if existing.as_ref().is_some_and(|blob| blob != &current_blob) {
      let latest = sqlx::query(
        "SELECT timestamp, blob, GREATEST(timestamp + interval '1 millisecond', \
         date_trunc('milliseconds', clock_timestamp())) AS next_timestamp \
         FROM snapshot_histories WHERE workspace_id = $1 AND guid = $2 ORDER BY timestamp DESC LIMIT 1",
      )
      .bind(workspace_id)
      .bind(&doc_id)
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load latest recovery archive: {e}")))?;
      let same_blob = latest.get::<Vec<u8>, _>("blob") == current_blob;
      if same_blob {
        latest.get::<DateTime<Utc>, _>("timestamp")
      } else {
        latest.get::<DateTime<Utc>, _>("next_timestamp")
      }
    } else {
      current_updated_at
    };

    sqlx::query(
      r#"INSERT INTO snapshot_histories
           (workspace_id, guid, timestamp, blob, state, expired_at, created_by)
         VALUES ($1, $2, $3, $4, NULL, clock_timestamp() + make_interval(secs => $5), $6)
         ON CONFLICT (workspace_id, guid, timestamp) DO UPDATE
           SET expired_at = GREATEST(snapshot_histories.expired_at, EXCLUDED.expired_at)
           WHERE snapshot_histories.blob = EXCLUDED.blob"#,
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .bind(archive_timestamp)
    .bind(&current_blob)
    .bind(retention)
    .bind(actor_user_id)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("archive current doc on recovery: {e}")))?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit recover_doc: {e}")))?;
    Ok(timestamp)
  }
}

// ---------------------------------------------------------------------------
// Background doc compaction (lock-free read, bounded blocking CRDT merge, and
// short strict-CAS commit) and expired record housekeeping.
// ---------------------------------------------------------------------------

const MAX_COMPACTION_CAS_RETRIES: usize = 2;

static COMPACTION_SCAN_CURSOR: OnceLock<Mutex<(String, String)>> = OnceLock::new();

fn compaction_scan_cursor() -> &'static Mutex<(String, String)> {
  COMPACTION_SCAN_CURSOR.get_or_init(|| Mutex::new((String::new(), String::new())))
}

fn compaction_merge_semaphore() -> &'static Arc<Semaphore> {
  static SEM: OnceLock<Arc<Semaphore>> = OnceLock::new();
  SEM.get_or_init(|| {
    let permits = std::thread::available_parallelism()
      .map(|n| n.get())
      .unwrap_or(2)
      .clamp(2, 8);
    Arc::new(Semaphore::new(permits))
  })
}

#[doc(hidden)]
pub async fn run_blocking_with_merge_permit<T, F>(semaphore: &Arc<Semaphore>, work: F) -> Result<T, DomainError>
where
  T: Send + 'static,
  F: FnOnce() -> Result<T, DomainError> + Send + 'static,
{
  let cpu_permit = Arc::clone(semaphore)
    .acquire_owned()
    .await
    .map_err(|_| DomainError::Unavailable("compaction merge semaphore closed".to_owned()))?;
  tokio::task::spawn_blocking(move || {
    let _permit = cpu_permit;
    work()
  })
  .await
  .map_err(|e| DomainError::Internal(format!("join compaction merge task: {e}")))?
}

fn sha256_bytes(data: &[u8]) -> [u8; 32] {
  Sha256::digest(data).into()
}

fn is_pg_deadlock(err: &sqlx::Error) -> bool {
  err
    .as_database_error()
    .and_then(|db_err| db_err.code())
    .is_some_and(|code| code == "40P01")
}

struct SnapshotRow {
  blob: Vec<u8>,
  updated_at: DateTime<Utc>,
  updated_by: Option<String>,
}

struct UpdateRow {
  blob: Vec<u8>,
  created_at: DateTime<Utc>,
  created_by: Option<String>,
}

struct Phase1Read {
  snapshot: Option<SnapshotRow>,
  snapshot_fp: Option<(DateTime<Utc>, [u8; 32], Option<String>)>,
  updates: Vec<UpdateRow>,
  batch_fingerprints: Vec<(DateTime<Utc>, [u8; 32])>,
}

struct Phase2Merged {
  final_blob: Vec<u8>,
  prev_snapshot_is_empty: bool,
  blob_changed: bool,
  parsed_meta: ParsedDocMeta,
}

enum Phase3Outcome {
  LockNotAcquired,
  Skipped,
  Committed(DocCompactionOutcome),
}

enum Phase3Error {
  CasMismatch,
  Deadlock,
  Fatal(DomainError),
}

fn map_phase3_sqlx(context: &'static str) -> impl FnOnce(sqlx::Error) -> Phase3Error {
  move |err| {
    if is_pg_deadlock(&err) {
      Phase3Error::Deadlock
    } else {
      Phase3Error::Fatal(DomainError::Internal(format!("{context}: {err}")))
    }
  }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DocCompactionOutcome {
  pub lock_acquired: bool,
  pub updates_merged: i64,
  pub history_created: bool,
}

/// Compacts pending rows in `updates` into `snapshots` using a lock-free
/// read and blocking CRDT merge followed by a short strict-CAS write transaction.
pub async fn compact_pending_doc_updates(
  db: &ServerDb,
  workspace_id: &str,
  doc_id: &str,
  batch_limit: i64,
  history_min_interval_ms: i64,
  history_max_age_seconds: i64,
) -> Result<DocCompactionOutcome, DomainError> {
  compact_pending_doc_updates_with_merge_hook(
    db,
    workspace_id,
    doc_id,
    batch_limit,
    history_min_interval_ms,
    history_max_age_seconds,
    |_| async {},
  )
  .await
}

#[doc(hidden)]
pub async fn compact_pending_doc_updates_with_merge_hook<F, Fut>(
  db: &ServerDb,
  workspace_id: &str,
  doc_id: &str,
  batch_limit: i64,
  history_min_interval_ms: i64,
  history_max_age_seconds: i64,
  mut on_phase2_merge: F,
) -> Result<DocCompactionOutcome, DomainError>
where
  F: FnMut(usize) -> Fut,
  Fut: Future<Output = ()>,
{
  if batch_limit <= 0 {
    return Err(DomainError::Validation("batch_limit must be positive".to_owned()));
  }

  for attempt in 0..=MAX_COMPACTION_CAS_RETRIES {
    // Phase 1: short lock-free read; release the connection before CPU merge work.
    let Some(phase1) = load_compaction_phase1(db, workspace_id, doc_id, batch_limit).await? else {
      return Ok(DocCompactionOutcome {
        lock_acquired: true,
        updates_merged: 0,
        history_created: false,
      });
    };

    // Phase 2: bounded CPU semaphore + spawn_blocking CRDT merge with zero DB locks held.
    // Move the owned permit into the blocking closure so cancelling the outer future
    // never frees a CPU slot while the merge is still running.
    let phase2 = {
      on_phase2_merge(attempt).await;
      let mut merge_inputs = Vec::with_capacity(phase1.updates.len() + usize::from(phase1.snapshot.is_some()));
      if let Some(snap) = &phase1.snapshot {
        merge_inputs.push(snap.blob.clone());
      }
      merge_inputs.extend(phase1.updates.iter().map(|u| u.blob.clone()));
      let prev_blob = phase1.snapshot.as_ref().map(|s| s.blob.clone());
      let ws_owned = workspace_id.to_owned();
      let doc_owned = doc_id.to_owned();
      run_blocking_with_merge_permit(compaction_merge_semaphore(), move || {
        let final_blob = if merge_inputs.len() == 1 {
          merge_inputs.remove(0)
        } else {
          y_octo::merge_updates_v1(merge_inputs)
            .and_then(|u| u.encode_v1())
            .map_err(|e| DomainError::Internal(format!("merge compaction updates: {e}")))?
        };
        let prev_snapshot_is_empty = prev_blob.as_deref().is_none_or(is_empty_doc_bin);
        let blob_changed = prev_blob.as_deref().is_none_or(|prev| prev != final_blob.as_slice());
        let parsed_meta = parse_doc_metadata(&ws_owned, &doc_owned, &final_blob);
        Ok(Phase2Merged {
          final_blob,
          prev_snapshot_is_empty,
          blob_changed,
          parsed_meta,
        })
      })
      .await?
    };

    // Phase 3: millisecond-level strict CAS write transaction.
    let mut tx = db
      .begin_tiered(WorkloadTier::LongQuery)
      .await
      .map_err(|e| DomainError::Internal(format!("begin doc compaction commit: {e}")))?;

    match commit_compaction_phase3(
      tx.tx_mut(),
      workspace_id,
      doc_id,
      &phase1,
      &phase2,
      history_min_interval_ms,
      history_max_age_seconds,
    )
    .await
    {
      Ok(Phase3Outcome::Committed(outcome)) => {
        if let Err(err) = tx.commit().await {
          if let server_db::DbError::Sqlx(sqlx_err) = &err
            && is_pg_deadlock(sqlx_err)
            && attempt < MAX_COMPACTION_CAS_RETRIES
          {
            continue;
          }
          return Err(DomainError::Internal(format!("commit doc compaction: {err}")));
        }
        return Ok(outcome);
      }
      Ok(Phase3Outcome::LockNotAcquired) => {
        let _ = tx.rollback().await;
        return Ok(DocCompactionOutcome {
          lock_acquired: false,
          updates_merged: 0,
          history_created: false,
        });
      }
      Ok(Phase3Outcome::Skipped) => {
        let _ = tx.rollback().await;
        return Ok(DocCompactionOutcome {
          lock_acquired: true,
          updates_merged: 0,
          history_created: false,
        });
      }
      Err(Phase3Error::CasMismatch | Phase3Error::Deadlock) => {
        let _ = tx.rollback().await;
        if attempt < MAX_COMPACTION_CAS_RETRIES {
          continue;
        }
        return Ok(DocCompactionOutcome {
          lock_acquired: false,
          updates_merged: 0,
          history_created: false,
        });
      }
      Err(Phase3Error::Fatal(err)) => {
        let _ = tx.rollback().await;
        return Err(err);
      }
    }
  }

  Ok(DocCompactionOutcome {
    lock_acquired: false,
    updates_merged: 0,
    history_created: false,
  })
}

async fn load_compaction_phase1(
  db: &ServerDb,
  workspace_id: &str,
  doc_id: &str,
  batch_limit: i64,
) -> Result<Option<Phase1Read>, DomainError> {
  let mut conn = db
    .acquire_tiered(WorkloadTier::LongQuery)
    .await
    .map_err(|e| DomainError::Internal(format!("acquire doc compaction read: {e}")))?;

  let deleted_doc: bool = sqlx::query_scalar(
    "SELECT COALESCE(lifecycle_state::text = 'deleted', false) FROM workspace_pages WHERE workspace_id = $1 AND page_id = $2",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(&mut *conn)
  .await
  .map_err(|e| DomainError::Internal(format!("check deleted doc before compaction: {e}")))?
  .unwrap_or(false);
  if deleted_doc {
    return Ok(None);
  }

  let snapshot = sqlx::query_as::<_, (Vec<u8>, DateTime<Utc>, Option<String>)>(
    "SELECT blob, updated_at, updated_by FROM snapshots WHERE workspace_id = $1 AND guid = $2",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(&mut *conn)
  .await
  .map_err(|e| DomainError::Internal(format!("load snapshot for compaction: {e}")))?
  .map(|(blob, updated_at, updated_by)| SnapshotRow {
    blob,
    updated_at,
    updated_by,
  });

  let updates: Vec<UpdateRow> = sqlx::query_as::<_, (Vec<u8>, DateTime<Utc>, Option<String>)>(
    "SELECT blob, created_at, created_by FROM updates WHERE workspace_id = $1 AND guid = $2 ORDER BY created_at ASC LIMIT $3",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(batch_limit)
  .fetch_all(&mut *conn)
  .await
  .map_err(|e| DomainError::Internal(format!("load updates for compaction: {e}")))?
  .into_iter()
  .map(|(blob, created_at, created_by)| UpdateRow {
    blob,
    created_at,
    created_by,
  })
  .collect();

  drop(conn);

  if updates.is_empty() {
    return Ok(None);
  }

  let snapshot_fp = snapshot
    .as_ref()
    .map(|s| (s.updated_at, sha256_bytes(&s.blob), s.updated_by.clone()));
  let batch_fingerprints = updates.iter().map(|u| (u.created_at, sha256_bytes(&u.blob))).collect();

  Ok(Some(Phase1Read {
    snapshot,
    snapshot_fp,
    updates,
    batch_fingerprints,
  }))
}

async fn commit_compaction_phase3(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
  phase1: &Phase1Read,
  phase2: &Phase2Merged,
  history_min_interval_ms: i64,
  history_max_age_seconds: i64,
) -> Result<Phase3Outcome, Phase3Error> {
  // Strict lock order: workspace shared lock before per-doc exclusive lock.
  let ws_locked: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock_shared(hashtextextended($1, 0))")
    .bind(format!("storage-workspace:{workspace_id}"))
    .fetch_one(&mut **tx)
    .await
    .map_err(map_phase3_sqlx("try lock workspace storage for compaction"))?;
  if !ws_locked {
    return Ok(Phase3Outcome::LockNotAcquired);
  }

  let doc_locked: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0))")
    .bind(format!("workspace-doc-update:{workspace_id}/{doc_id}"))
    .fetch_one(&mut **tx)
    .await
    .map_err(map_phase3_sqlx("try lock doc compaction"))?;
  if !doc_locked {
    return Ok(Phase3Outcome::LockNotAcquired);
  }

  let ws_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1)")
    .bind(workspace_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(map_phase3_sqlx("check workspace exists before compaction"))?;
  if !ws_exists {
    return Ok(Phase3Outcome::Skipped);
  }

  let deleted_doc: bool = sqlx::query_scalar(
    "SELECT COALESCE(lifecycle_state::text = 'deleted', false) FROM workspace_pages WHERE workspace_id = $1 AND page_id = $2",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(map_phase3_sqlx("recheck deleted doc before compaction"))?
  .unwrap_or(false);
  if deleted_doc {
    return Ok(Phase3Outcome::Skipped);
  }

  let first = phase1.updates.first().expect("updates non-empty");
  let last = phase1.updates.last().expect("updates non-empty");

  match &phase1.snapshot_fp {
    None => {
      sqlx::query(
        r#"INSERT INTO runtime_doc_creators (workspace_id, doc_id, created_by, created_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (workspace_id, doc_id) DO NOTHING"#,
      )
      .bind(workspace_id)
      .bind(doc_id)
      .bind(first.created_by.as_deref())
      .bind(first.created_at)
      .execute(&mut **tx)
      .await
      .map_err(map_phase3_sqlx("insert runtime_doc_creators"))?;

      let creator: Option<String> =
        sqlx::query_scalar("SELECT created_by FROM runtime_doc_creators WHERE workspace_id = $1 AND doc_id = $2")
          .bind(workspace_id)
          .bind(doc_id)
          .fetch_optional(&mut **tx)
          .await
          .map_err(map_phase3_sqlx("load runtime_doc_creators"))?
          .flatten();

      let inserted: Option<DateTime<Utc>> = sqlx::query_scalar(
        r#"INSERT INTO snapshots
             (workspace_id, guid, blob, size, created_at, updated_at, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (workspace_id, guid) DO NOTHING
           RETURNING updated_at"#,
      )
      .bind(workspace_id)
      .bind(doc_id)
      .bind(&phase2.final_blob)
      .bind(phase2.final_blob.len() as i64)
      .bind(first.created_at)
      .bind(last.created_at)
      .bind(creator.as_deref())
      .bind(last.created_by.as_deref())
      .fetch_optional(&mut **tx)
      .await
      .map_err(map_phase3_sqlx("insert compacted snapshot"))?;
      if inserted.is_none() {
        return Err(Phase3Error::CasMismatch);
      }
    }
    Some((base_updated_at, base_hash, base_updated_by)) => {
      let current = sqlx::query_as::<_, (Vec<u8>, DateTime<Utc>, Option<String>)>(
        "SELECT blob, updated_at, updated_by FROM snapshots WHERE workspace_id = $1 AND guid = $2 FOR UPDATE",
      )
      .bind(workspace_id)
      .bind(doc_id)
      .fetch_optional(&mut **tx)
      .await
      .map_err(map_phase3_sqlx("lock snapshot for compaction cas"))?;

      let Some((cur_blob, cur_updated_at, cur_updated_by)) = current else {
        return Err(Phase3Error::CasMismatch);
      };
      if cur_updated_at != *base_updated_at
        || sha256_bytes(&cur_blob) != *base_hash
        || cur_updated_by != *base_updated_by
      {
        return Err(Phase3Error::CasMismatch);
      }

      let mut timestamp = (*base_updated_at).max(last.created_at);
      if *base_updated_at >= last.created_at && phase2.blob_changed {
        timestamp = next_doc_timestamp_in(tx, workspace_id, doc_id)
          .await
          .map_err(Phase3Error::Fatal)?;
      }
      let editor = if *base_updated_at > last.created_at {
        base_updated_by.as_deref().or(last.created_by.as_deref())
      } else {
        last.created_by.as_deref()
      };

      let updated: Option<DateTime<Utc>> = sqlx::query_scalar(
        r#"UPDATE snapshots
           SET blob = $3,
               size = $4,
               updated_at = $5,
               updated_by = $6
           WHERE workspace_id = $1
             AND guid = $2
           RETURNING updated_at"#,
      )
      .bind(workspace_id)
      .bind(doc_id)
      .bind(&phase2.final_blob)
      .bind(phase2.final_blob.len() as i64)
      .bind(timestamp)
      .bind(editor)
      .fetch_optional(&mut **tx)
      .await
      .map_err(map_phase3_sqlx("update compacted snapshot"))?;
      if updated.is_none() {
        return Err(Phase3Error::CasMismatch);
      }
    }
  }

  // Verify exact update fingerprints before deleting only the merged batch.
  let timestamps: Vec<DateTime<Utc>> = phase1.batch_fingerprints.iter().map(|(ts, _)| *ts).collect();
  let locked_updates: Vec<(DateTime<Utc>, Vec<u8>)> = sqlx::query_as(
    r#"SELECT created_at, blob
       FROM updates
       WHERE workspace_id = $1 AND guid = $2 AND created_at = ANY($3)
       ORDER BY created_at ASC
       FOR UPDATE"#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(&timestamps)
  .fetch_all(&mut **tx)
  .await
  .map_err(map_phase3_sqlx("lock updates for compaction cas"))?;

  if locked_updates.len() != phase1.batch_fingerprints.len() {
    return Err(Phase3Error::CasMismatch);
  }
  for ((cur_ts, cur_blob), (exp_ts, exp_hash)) in locked_updates.iter().zip(&phase1.batch_fingerprints) {
    if cur_ts != exp_ts || sha256_bytes(cur_blob) != *exp_hash {
      return Err(Phase3Error::CasMismatch);
    }
  }

  let deleted = sqlx::query("DELETE FROM updates WHERE workspace_id = $1 AND guid = $2 AND created_at = ANY($3)")
    .bind(workspace_id)
    .bind(doc_id)
    .bind(&timestamps)
    .execute(&mut **tx)
    .await
    .map_err(map_phase3_sqlx("delete compacted updates"))?
    .rows_affected();
  if deleted as usize != phase1.batch_fingerprints.len() {
    return Err(Phase3Error::CasMismatch);
  }

  sqlx::query(
    r#"UPDATE doc_blob_ref_projections
       SET status = 'pending',
           indexed_at = NULL,
           error_code = NULL,
           error_summary = NULL,
           updated_at = clock_timestamp()
       WHERE workspace_id = $1 AND doc_id = $2"#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .execute(&mut **tx)
  .await
  .map_err(map_phase3_sqlx("mark doc_blob_ref_projections pending"))?;

  let has_embedding_sources: bool = sqlx::query_scalar("SELECT to_regclass('public.embedding_sources') IS NOT NULL")
    .fetch_one(&mut **tx)
    .await
    .map_err(map_phase3_sqlx("check embedding_sources table"))?;
  if has_embedding_sources {
    sqlx::query(
      r#"UPDATE embedding_sources
         SET deleted_at = clock_timestamp(),
             updated_at = clock_timestamp()
         WHERE workspace_id = $1
           AND source_kind = 'document'
           AND source_key = $2"#,
    )
    .bind(workspace_id)
    .bind(doc_id)
    .execute(&mut **tx)
    .await
    .map_err(map_phase3_sqlx("invalidate embedding_sources"))?;
  }

  if workspace_id == doc_id {
    sqlx::query("UPDATE workspaces SET last_check_embeddings = '1970-01-01T00:00:00Z' WHERE id = $1")
      .bind(workspace_id)
      .execute(&mut **tx)
      .await
      .map_err(map_phase3_sqlx("reset workspace last_check_embeddings"))?;
  }

  apply_parsed_doc_metadata_in(tx, workspace_id, doc_id, &phase2.parsed_meta)
    .await
    .map_err(map_phase3_sqlx("backfill compacted doc metadata"))?;

  let mut history_created = false;
  if let Some(snap) = &phase1.snapshot
    && history_max_age_seconds > 0
    && !phase2.prev_snapshot_is_empty
    && should_create_history_in(tx, snap.updated_at, workspace_id, doc_id, history_min_interval_ms)
      .await
      .map_err(Phase3Error::Fatal)?
  {
    let expired_at = Utc::now() + Duration::seconds(history_max_age_seconds);
    sqlx::query(
      r#"INSERT INTO snapshot_histories
           (workspace_id, guid, timestamp, blob, expired_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (workspace_id, guid, timestamp) DO UPDATE
           SET expired_at = EXCLUDED.expired_at"#,
    )
    .bind(workspace_id)
    .bind(doc_id)
    .bind(snap.updated_at)
    .bind(&snap.blob)
    .bind(expired_at)
    .bind(snap.updated_by.as_deref())
    .execute(&mut **tx)
    .await
    .map_err(map_phase3_sqlx("insert compacted snapshot history"))?;
    history_created = true;
  }

  Ok(Phase3Outcome::Committed(DocCompactionOutcome {
    lock_acquired: true,
    updates_merged: deleted as i64,
    history_created,
  }))
}

async fn next_doc_timestamp_in(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
) -> Result<DateTime<Utc>, DomainError> {
  sqlx::query_scalar(
    r#"SELECT GREATEST(
         date_trunc('milliseconds', clock_timestamp()),
         COALESCE((SELECT updated_at + interval '1 millisecond' FROM snapshots WHERE workspace_id = $1 AND guid = $2), '-infinity'::timestamptz),
         COALESCE((SELECT MAX(created_at) + interval '1 millisecond' FROM updates WHERE workspace_id = $1 AND guid = $2), '-infinity'::timestamptz)
       )"#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_one(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("compute next doc timestamp: {e}")))
}

async fn should_create_history_in(
  tx: &mut Transaction<'_, Postgres>,
  snapshot_updated_at: DateTime<Utc>,
  workspace_id: &str,
  doc_id: &str,
  history_min_interval_ms: i64,
) -> Result<bool, DomainError> {
  let latest: Option<DateTime<Utc>> = sqlx::query_scalar(
    "SELECT timestamp FROM snapshot_histories WHERE workspace_id = $1 AND guid = $2 ORDER BY timestamp DESC LIMIT 1",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("load latest snapshot history: {e}")))?;
  let Some(last_ts) = latest else {
    return Ok(true);
  };
  if last_ts == snapshot_updated_at {
    return Ok(false);
  }
  let threshold = snapshot_updated_at - Duration::milliseconds(history_min_interval_ms.max(0));
  Ok(last_ts < threshold)
}

async fn loose_index_scan_pending_docs(
  db: &ServerDb,
  after_ws: &str,
  after_guid: &str,
  upper_bound: Option<(&str, &str)>,
  limit: i64,
) -> Result<Vec<(String, String)>, DomainError> {
  if limit <= 0 {
    return Ok(Vec::new());
  }
  let mut conn = db
    .acquire_tiered(WorkloadTier::LongQuery)
    .await
    .map_err(|e| DomainError::Unavailable(format!("acquire pending update docs: {e}")))?;
  let rows = match upper_bound {
    None => {
      sqlx::query_as(
        r#"WITH RECURSIVE pending(workspace_id, guid, depth) AS (
             (
               SELECT workspace_id, guid, 1
               FROM updates
               WHERE (workspace_id, guid) > ($1, $2)
               ORDER BY workspace_id ASC, guid ASC
               LIMIT 1
             )
             UNION ALL
             SELECT next_pair.workspace_id, next_pair.guid, p.depth + 1
             FROM pending p
             CROSS JOIN LATERAL (
               SELECT u.workspace_id, u.guid
               FROM updates u
               WHERE (u.workspace_id, u.guid) > (p.workspace_id, p.guid)
               ORDER BY u.workspace_id ASC, u.guid ASC
               LIMIT 1
             ) AS next_pair
             WHERE p.depth < $3
           )
           SELECT workspace_id, guid FROM pending"#,
      )
      .bind(after_ws)
      .bind(after_guid)
      .bind(limit)
      .fetch_all(&mut *conn)
      .await
    }
    Some((max_ws, max_guid)) => {
      sqlx::query_as(
        r#"WITH RECURSIVE pending(workspace_id, guid, depth) AS (
             (
               SELECT workspace_id, guid, 1
               FROM updates
               WHERE (workspace_id, guid) > ($1, $2)
                 AND (workspace_id, guid) <= ($4, $5)
               ORDER BY workspace_id ASC, guid ASC
               LIMIT 1
             )
             UNION ALL
             SELECT next_pair.workspace_id, next_pair.guid, p.depth + 1
             FROM pending p
             CROSS JOIN LATERAL (
               SELECT u.workspace_id, u.guid
               FROM updates u
               WHERE (u.workspace_id, u.guid) > (p.workspace_id, p.guid)
                 AND (u.workspace_id, u.guid) <= ($4, $5)
               ORDER BY u.workspace_id ASC, u.guid ASC
               LIMIT 1
             ) AS next_pair
             WHERE p.depth < $3
           )
           SELECT workspace_id, guid FROM pending"#,
      )
      .bind(after_ws)
      .bind(after_guid)
      .bind(limit)
      .bind(max_ws)
      .bind(max_guid)
      .fetch_all(&mut *conn)
      .await
    }
  }
  .map_err(|e| DomainError::Internal(format!("list pending update docs: {e}")))?;
  Ok(rows)
}

/// Scans pending `(workspace_id, guid)` pairs in `updates` via a rotating
/// loose index scan and compacts up to `max_docs` documents while caching each
/// workspace's `history_period_seconds` quota per batch.
pub async fn compact_pending_docs_batch(
  db: &ServerDb,
  quota_gate: &dyn QuotaGate,
  max_docs: i64,
  batch_limit: i64,
  history_min_interval_ms: i64,
  is_cancelled: impl Fn() -> bool,
) -> Result<usize, DomainError> {
  let limit = max_docs.clamp(1, 500);
  let (cursor_ws, cursor_guid) = {
    let guard = compaction_scan_cursor().lock().unwrap_or_else(|e| e.into_inner());
    guard.clone()
  };

  let mut pairs = loose_index_scan_pending_docs(db, &cursor_ws, &cursor_guid, None, limit).await?;
  if (pairs.len() as i64) < limit && (!cursor_ws.is_empty() || !cursor_guid.is_empty()) {
    let remaining = limit - pairs.len() as i64;
    let wrapped = loose_index_scan_pending_docs(db, "", "", Some((&cursor_ws, &cursor_guid)), remaining).await?;
    pairs.extend(wrapped);
  }

  if pairs.is_empty() {
    let mut guard = compaction_scan_cursor().lock().unwrap_or_else(|e| e.into_inner());
    *guard = (String::new(), String::new());
    return Ok(0);
  }

  let mut quota_cache: HashMap<String, i64> = HashMap::new();
  let mut compacted = 0usize;
  let mut last_visited: Option<(String, String)> = None;

  for (workspace_id, doc_id) in pairs {
    if is_cancelled() {
      break;
    }
    last_visited = Some((workspace_id.clone(), doc_id.clone()));

    let history_secs = if let Some(&cached) = quota_cache.get(&workspace_id) {
      cached
    } else {
      let mut tx = db
        .begin_tiered(WorkloadTier::LongQuery)
        .await
        .map_err(|e| DomainError::Unavailable(format!("begin quota lookup for compaction: {e}")))?;
      let resolved = match quota_gate
        .resolve_workspace_grant(tx.tx_mut(), &workspace_id, Utc::now())
        .await
      {
        Ok(grant) => grant.limits.history_period_seconds,
        Err(err) => {
          let _ = tx.rollback().await;
          tracing::warn!(
            workspace_id = %workspace_id,
            doc_id = %doc_id,
            error = %err,
            "skipping doc compaction because workspace quota lookup failed"
          );
          continue;
        }
      };
      let _ = tx.rollback().await;
      quota_cache.insert(workspace_id.clone(), resolved);
      resolved
    };

    match compact_pending_doc_updates(
      db,
      &workspace_id,
      &doc_id,
      batch_limit,
      history_min_interval_ms,
      history_secs,
    )
    .await
    {
      Ok(outcome) => {
        if outcome.updates_merged > 0 {
          compacted += 1;
        }
      }
      Err(err) => {
        tracing::warn!(
          workspace_id = %workspace_id,
          doc_id = %doc_id,
          error = %err,
          "doc compaction failed; continuing batch"
        );
      }
    }
  }

  if let Some(last) = last_visited {
    let mut guard = compaction_scan_cursor().lock().unwrap_or_else(|e| e.into_inner());
    *guard = last;
  }

  Ok(compacted)
}

pub async fn cleanup_expired_user_sessions(db: &ServerDb, limit: i64) -> Result<i64, DomainError> {
  let mut conn = db
    .acquire_tiered(WorkloadTier::LongQuery)
    .await
    .map_err(|e| DomainError::Unavailable(format!("acquire cleanup user_sessions: {e}")))?;
  let res = sqlx::query(
    r#"DELETE FROM user_sessions
       WHERE id IN (
         SELECT id FROM user_sessions
         WHERE expires_at <= CURRENT_TIMESTAMP
         ORDER BY expires_at ASC
         LIMIT $1
       )"#,
  )
  .bind(limit.max(1))
  .execute(&mut *conn)
  .await
  .map_err(|e| DomainError::Internal(format!("cleanup expired user_sessions: {e}")))?;
  Ok(res.rows_affected() as i64)
}

pub async fn cleanup_expired_snapshot_histories(db: &ServerDb, limit: i64) -> Result<i64, DomainError> {
  let mut conn = db
    .acquire_tiered(WorkloadTier::LongQuery)
    .await
    .map_err(|e| DomainError::Unavailable(format!("acquire cleanup snapshot_histories: {e}")))?;
  let res = sqlx::query(
    r#"DELETE FROM snapshot_histories
       WHERE (workspace_id, guid, timestamp) IN (
         SELECT workspace_id, guid, timestamp
         FROM snapshot_histories
         WHERE expired_at <= CURRENT_TIMESTAMP
         ORDER BY expired_at ASC
         LIMIT $1
       )"#,
  )
  .bind(limit.max(1))
  .execute(&mut *conn)
  .await
  .map_err(|e| DomainError::Internal(format!("cleanup expired snapshot_histories: {e}")))?;
  Ok(res.rows_affected() as i64)
}

pub async fn cleanup_expired_runtime_states(db: &ServerDb, limit: i64) -> Result<i64, DomainError> {
  let mut conn = db
    .acquire_tiered(WorkloadTier::LongQuery)
    .await
    .map_err(|e| DomainError::Unavailable(format!("acquire cleanup runtime_states: {e}")))?;
  let res = sqlx::query(
    r#"DELETE FROM runtime_states
       WHERE (purpose, token_hash) IN (
         SELECT purpose, token_hash FROM runtime_states
         WHERE expires_at <= CURRENT_TIMESTAMP OR consumed_at IS NOT NULL
         ORDER BY expires_at ASC
         LIMIT $1
       )"#,
  )
  .bind(limit.max(1))
  .execute(&mut *conn)
  .await
  .map_err(|e| DomainError::Internal(format!("cleanup expired runtime_states: {e}")))?;
  Ok(res.rows_affected() as i64)
}

pub async fn cleanup_expired_blob_reservations(db: &ServerDb, limit: i64) -> Result<(i64, i64), DomainError> {
  let mut conn = db
    .acquire_tiered(WorkloadTier::LongQuery)
    .await
    .map_err(|e| DomainError::Unavailable(format!("acquire cleanup blob reservations: {e}")))?;
  let blobs = sqlx::query(
    r#"DELETE FROM blobs
       WHERE (workspace_id, key) IN (
         SELECT workspace_id, key FROM blobs
         WHERE status = 'pending' AND reservation_expires_at <= CURRENT_TIMESTAMP
         ORDER BY reservation_expires_at ASC
         LIMIT $1
       )"#,
  )
  .bind(limit.max(1))
  .execute(&mut *conn)
  .await
  .map_err(|e| DomainError::Internal(format!("cleanup expired blob reservations: {e}")))?
  .rows_affected() as i64;

  let attachments = sqlx::query(
    r#"DELETE FROM comment_attachments
       WHERE (workspace_id, doc_id, key) IN (
         SELECT workspace_id, doc_id, key FROM comment_attachments
         WHERE status = 'pending' AND reservation_expires_at <= CURRENT_TIMESTAMP
         ORDER BY reservation_expires_at ASC
         LIMIT $1
       )"#,
  )
  .bind(limit.max(1))
  .execute(&mut *conn)
  .await
  .map_err(|e| DomainError::Internal(format!("cleanup expired comment attachment reservations: {e}")))?
  .rows_affected() as i64;

  Ok((blobs, attachments))
}

#[cfg(test)]
mod tests {
  use super::*;
  use server_db::DbConfig;
  use uuid::Uuid;

  #[test]
  fn compaction_records_creator_invalidates_projection_and_rolls_back_on_stale_snapshot() {
    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
    let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
    let template = cluster.ensure_template(&migrations).expect("ensure template");
    let lease = cluster
      .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
      .expect("lease test db");
    let db_url = lease.url().to_owned();

    let rt = tokio::runtime::Builder::new_current_thread()
      .enable_all()
      .build()
      .expect("runtime");
    rt.block_on(async move {
      let db = ServerDb::connect(DbConfig {
        database_url: db_url,
        channel: "canary".into(),
        role: server_types::ServerRole::Allinone,
        selfhosted: true,
        max_connections: 4,
        statement_timeout_ms: 5_000,
        tier_permits: [8, 4, 2, 2],
      })
      .await
      .expect("connect db");
      sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        .execute(db.pool())
        .await
        .expect("reset schema");
      db.ensure_schema_ready().await.expect("ensure schema");

      let user_id = Uuid::new_v4().to_string();
      let ws_id = Uuid::new_v4().to_string();
      let doc1 = "doc-first-compact";
      let doc2 = "doc-stale-snapshot";
      sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, 'Author', 'compactor@example.com')")
        .bind(&user_id)
        .execute(db.pool())
        .await
        .expect("insert user");
      sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
        .bind(&ws_id)
        .execute(db.pool())
        .await
        .expect("insert workspace");

      let doc_bin = y_octo::Doc::default().encode_state_as_update_v1(&Default::default()).expect("yjs");
      let t0 = Utc::now() - Duration::seconds(60);

      // 1. First compaction: seeds runtime_doc_creators and marks doc_blob_ref_projections pending.
      sqlx::query(
        "INSERT INTO doc_blob_ref_projections (workspace_id, doc_id, source_revision, parser_version, status, indexed_at) VALUES ($1, $2, clock_timestamp(), 1, 'fresh', clock_timestamp())",
      )
      .bind(&ws_id)
      .bind(doc1)
      .execute(db.pool())
      .await
      .expect("insert projection");
      sqlx::query(
        "INSERT INTO updates (workspace_id, guid, blob, created_at, created_by) VALUES ($1, $2, $3, $4, $5)",
      )
      .bind(&ws_id)
      .bind(doc1)
      .bind(&doc_bin)
      .bind(t0)
      .bind(&user_id)
      .execute(db.pool())
      .await
      .expect("insert update");

      let outcome = compact_pending_doc_updates(&db, &ws_id, doc1, 100, 0, 0)
        .await
        .expect("first compaction");
      assert!(outcome.lock_acquired);
      assert_eq!(outcome.updates_merged, 1);

      let creator: Option<String> = sqlx::query_scalar(
        "SELECT created_by FROM runtime_doc_creators WHERE workspace_id = $1 AND doc_id = $2",
      )
      .bind(&ws_id)
      .bind(doc1)
      .fetch_one(db.pool())
      .await
      .expect("fetch creator");
      assert_eq!(creator.as_deref(), Some(user_id.as_str()));

      let proj_status: String = sqlx::query_scalar(
        "SELECT status FROM doc_blob_ref_projections WHERE workspace_id = $1 AND doc_id = $2",
      )
      .bind(&ws_id)
      .bind(doc1)
      .fetch_one(db.pool())
      .await
      .expect("fetch projection status");
      assert_eq!(proj_status, "pending");

      // 2. Stale snapshot guard: if concurrent snapshot writes keep racing ahead of
      //    every CAS attempt, compaction rolls back and preserves all updates.
      sqlx::query(
        "INSERT INTO updates (workspace_id, guid, blob, created_at, created_by) VALUES ($1, $2, $3, $4, $5)",
      )
      .bind(&ws_id)
      .bind(doc2)
      .bind(&doc_bin)
      .bind(t0)
      .bind(&user_id)
      .execute(db.pool())
      .await
      .expect("insert doc2 update");

      let db_hook = db.clone();
      let ws_hook = ws_id.clone();
      let stale_outcome = compact_pending_doc_updates_with_merge_hook(&db, &ws_id, doc2, 100, 0, 0, move |attempt| {
        let db_hook = db_hook.clone();
        let ws_hook = ws_hook.clone();
        async move {
          let bumped = Utc::now() + Duration::minutes(10 + attempt as i64);
          sqlx::query(
            r#"INSERT INTO snapshots (workspace_id, guid, blob, size, created_at, updated_at)
               VALUES ($1, $2, $3, 2, now(), $4)
               ON CONFLICT (workspace_id, guid) DO UPDATE SET updated_at = EXCLUDED.updated_at"#,
          )
          .bind(&ws_hook)
          .bind(doc2)
          .bind(&[0u8, 0u8][..])
          .bind(bumped)
          .execute(db_hook.pool())
          .await
          .expect("inject concurrent snapshot");
        }
      })
      .await
      .expect("stale compaction");
      assert!(!stale_outcome.lock_acquired);
      assert_eq!(stale_outcome.updates_merged, 0);

      let remaining_updates: i64 =
        sqlx::query_scalar("SELECT COUNT(*)::bigint FROM updates WHERE workspace_id = $1 AND guid = $2")
          .bind(&ws_id)
          .bind(doc2)
          .fetch_one(db.pool())
          .await
          .expect("count remaining updates");
      assert_eq!(remaining_updates, 1, "updates must be preserved when snapshot write does not apply");
    });
    drop(lease);
  }

  fn build_synthetic_root_doc(name: &str, avatar: &str) -> Vec<u8> {
    let doc = y_octo::Doc::with_client(401);
    let mut meta = doc.get_or_create_map("meta").unwrap();
    meta
      .insert("name".to_owned(), y_octo::Any::String(name.to_owned()))
      .unwrap();
    meta
      .insert("avatar".to_owned(), y_octo::Any::String(avatar.to_owned()))
      .unwrap();
    doc.encode_update_v1().unwrap()
  }

  fn build_synthetic_page_doc(title: &str, paragraphs: &[&str]) -> Vec<u8> {
    let doc = y_octo::Doc::with_client(402);
    let mut blocks = doc.get_or_create_map("blocks").unwrap();

    let mut page = doc.create_map().unwrap();
    page
      .insert("sys:id".to_owned(), y_octo::Any::String("page-1".into()))
      .unwrap();
    page
      .insert("sys:flavour".to_owned(), y_octo::Any::String("affine:page".into()))
      .unwrap();
    let mut title_text = doc.create_text().unwrap();
    title_text.insert(0, title).unwrap();
    page.insert("prop:title".to_owned(), title_text).unwrap();
    let mut page_children = doc.create_array().unwrap();
    page_children.push(y_octo::Any::String("note-1".into())).unwrap();
    page.insert("sys:children".to_owned(), page_children).unwrap();
    blocks.insert("page-1".to_owned(), page).unwrap();

    let mut note = doc.create_map().unwrap();
    note
      .insert("sys:id".to_owned(), y_octo::Any::String("note-1".into()))
      .unwrap();
    note
      .insert("sys:flavour".to_owned(), y_octo::Any::String("affine:note".into()))
      .unwrap();
    let mut note_children = doc.create_array().unwrap();
    // Nested affine:list (parent -> child) before top-level paragraphs verifies pre-order DFS order.
    note_children.push(y_octo::Any::String("list-parent".into())).unwrap();
    let mut list_parent = doc.create_map().unwrap();
    list_parent
      .insert("sys:id".to_owned(), y_octo::Any::String("list-parent".into()))
      .unwrap();
    list_parent
      .insert("sys:flavour".to_owned(), y_octo::Any::String("affine:list".into()))
      .unwrap();
    let mut lp_text = doc.create_text().unwrap();
    lp_text.insert(0, "L1:").unwrap();
    list_parent.insert("prop:text".to_owned(), lp_text).unwrap();
    let mut lp_children = doc.create_array().unwrap();
    lp_children.push(y_octo::Any::String("list-child".into())).unwrap();
    list_parent.insert("sys:children".to_owned(), lp_children).unwrap();
    blocks.insert("list-parent".to_owned(), list_parent).unwrap();

    let mut list_child = doc.create_map().unwrap();
    list_child
      .insert("sys:id".to_owned(), y_octo::Any::String("list-child".into()))
      .unwrap();
    list_child
      .insert("sys:flavour".to_owned(), y_octo::Any::String("affine:list".into()))
      .unwrap();
    let mut lc_text = doc.create_text().unwrap();
    lc_text.insert(0, "L1a;").unwrap();
    list_child.insert("prop:text".to_owned(), lc_text).unwrap();
    blocks.insert("list-child".to_owned(), list_child).unwrap();

    for (idx, body) in paragraphs.iter().enumerate() {
      let para_id = format!("para-{idx}");
      note_children.push(y_octo::Any::String(para_id.clone())).unwrap();
      let mut para = doc.create_map().unwrap();
      para
        .insert("sys:id".to_owned(), y_octo::Any::String(para_id.clone()))
        .unwrap();
      para
        .insert("sys:flavour".to_owned(), y_octo::Any::String("affine:paragraph".into()))
        .unwrap();
      let mut p_text = doc.create_text().unwrap();
      p_text.insert(0, body).unwrap();
      para.insert("prop:text".to_owned(), p_text).unwrap();
      blocks.insert(para_id, para).unwrap();
    }
    note.insert("sys:children".to_owned(), note_children).unwrap();
    blocks.insert("note-1".to_owned(), note).unwrap();

    doc.encode_update_v1().unwrap()
  }

  #[test]
  fn compaction_backfills_workspace_and_page_metadata_without_touching_reserved_or_deleted_docs() {
    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
    let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
    let template = cluster.ensure_template(&migrations).expect("ensure template");
    let lease = cluster
      .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
      .expect("lease test db");
    let db_url = lease.url().to_owned();

    let rt = tokio::runtime::Builder::new_current_thread()
      .enable_all()
      .build()
      .expect("runtime");
    rt.block_on(async move {
      let db = ServerDb::connect(DbConfig {
        database_url: db_url,
        channel: "canary".into(),
        role: server_types::ServerRole::Allinone,
        selfhosted: true,
        max_connections: 4,
        statement_timeout_ms: 5_000,
        tier_permits: [8, 4, 2, 2],
      })
      .await
      .expect("connect db");
      sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        .execute(db.pool())
        .await
        .expect("reset schema");
      db.ensure_schema_ready().await.expect("ensure schema");

      let user_id = Uuid::new_v4().to_string();
      let ws_compact = format!("ws-compact-{}", Uuid::new_v4().simple());
      sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, 'Author', 'meta@example.com')")
        .bind(&user_id)
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
        .bind(&ws_compact)
        .execute(db.pool())
        .await
        .unwrap();

      let t0 = Utc::now() - Duration::seconds(60);
      let root_bin = build_synthetic_root_doc("Synthetic Workspace", "avatar-key-1");
      let para1 = "a".repeat(120);
      let para2 = "b".repeat(60);
      let para3 = "c".repeat(40);
      let page_bin = build_synthetic_page_doc("Synthetic Page Title", &[&para1, &para2, &para3]);
      let db_sys_doc = format!("db${ws_compact}$docProperties");
      let userdata_doc = format!("userdata${user_id}${ws_compact}$favorite");

      // Pre-populate a deleted page row that must never be resurrected.
      sqlx::query(
        "INSERT INTO workspace_pages (workspace_id, page_id, title, summary, lifecycle_state)
         VALUES ($1, 'doc-deleted', 'Old Deleted', 'old', 'deleted')",
      )
      .bind(&ws_compact)
      .execute(db.pool())
      .await
      .unwrap();

      for (guid, blob) in [
        (ws_compact.as_str(), root_bin.as_slice()),
        ("doc-ordinary", page_bin.as_slice()),
        ("doc-deleted", page_bin.as_slice()),
        (db_sys_doc.as_str(), page_bin.as_slice()),
        (userdata_doc.as_str(), page_bin.as_slice()),
      ] {
        sqlx::query(
          "INSERT INTO updates (workspace_id, guid, blob, created_at, created_by)
           VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(&ws_compact)
        .bind(guid)
        .bind(blob)
        .bind(t0)
        .bind(&user_id)
        .execute(db.pool())
        .await
        .unwrap();
      }

      let quota = server_spi::CommunityQuotaGate::new();
      let compacted = compact_pending_docs_batch(&db, &quota, 100, 500, 600_000, || false)
        .await
        .expect("compact batch");
      assert_eq!(compacted, 4, "deleted doc is skipped; 4 active docs compact");

      let (ws_name, ws_avatar): (Option<String>, Option<String>) =
        sqlx::query_as("SELECT name, avatar_key FROM workspaces WHERE id = $1")
          .bind(&ws_compact)
          .fetch_one(db.pool())
          .await
          .unwrap();
      assert_eq!(ws_name.as_deref(), Some("Synthetic Workspace"));
      assert_eq!(ws_avatar.as_deref(), Some("avatar-key-1"));

      // Pre-order DFS: L1: (3) + L1a; (4) + para1 (120) + para2 (60) -> remaining drops below 0, so para3 is NOT appended.
      let expected_summary = format!("L1:L1a;{para1}{para2}");
      let (page_title, page_summary): (Option<String>, Option<String>) =
        sqlx::query_as("SELECT title, summary FROM workspace_pages WHERE workspace_id = $1 AND page_id = 'doc-ordinary'")
          .bind(&ws_compact)
          .fetch_one(db.pool())
          .await
          .unwrap();
      assert_eq!(page_title.as_deref(), Some("Synthetic Page Title"));
      assert_eq!(page_summary.as_deref(), Some(expected_summary.as_str()));

      // Reserved docs must not appear in workspace_pages.
      let reserved_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)::bigint FROM workspace_pages WHERE workspace_id = $1 AND page_id = ANY($2)",
      )
      .bind(&ws_compact)
      .bind(vec![ws_compact.clone(), db_sys_doc.clone(), userdata_doc.clone()])
      .fetch_one(db.pool())
      .await
      .unwrap();
      assert_eq!(reserved_count, 0);

      // Deleted doc remains deleted with original metadata untouched.
      let (del_state, del_title): (String, Option<String>) = sqlx::query_as(
        "SELECT lifecycle_state::text, title FROM workspace_pages WHERE workspace_id = $1 AND page_id = 'doc-deleted'",
      )
      .bind(&ws_compact)
      .fetch_one(db.pool())
      .await
      .unwrap();
      assert_eq!(del_state, "deleted");
      assert_eq!(del_title.as_deref(), Some("Old Deleted"));

      // Second compaction on doc-ordinary must preserve existing mode and published_at.
      let pub_ts = Utc::now() - Duration::hours(1);
      sqlx::query(
        "UPDATE workspace_pages SET mode = 1, published_at = $2 WHERE workspace_id = $1 AND page_id = 'doc-ordinary'",
      )
      .bind(&ws_compact)
      .bind(pub_ts)
      .execute(db.pool())
      .await
      .unwrap();
      let mut updated_doc = y_octo::Doc::with_client(403);
      updated_doc.apply_update_from_binary_v1(&page_bin).unwrap();
      let sv = updated_doc.get_state_vector();
      {
        let blocks = updated_doc.get_or_create_map("blocks").unwrap();
        if let Some(y_octo::Value::Map(mut page)) = blocks.get("page-1") {
          let mut new_title = updated_doc.create_text().unwrap();
          new_title.insert(0, "Updated Page Title").unwrap();
          page.insert("prop:title".to_owned(), new_title).unwrap();
        }
        if let Some(y_octo::Value::Map(mut note)) = blocks.get("note-1") {
          let mut new_children = updated_doc.create_array().unwrap();
          new_children.push(y_octo::Any::String("para-fresh".into())).unwrap();
          note.insert("sys:children".to_owned(), new_children).unwrap();
        }
        let mut fresh_para = updated_doc.create_map().unwrap();
        fresh_para
          .insert("sys:id".to_owned(), y_octo::Any::String("para-fresh".into()))
          .unwrap();
        fresh_para
          .insert(
            "sys:flavour".to_owned(),
            y_octo::Any::String("affine:paragraph".into()),
          )
          .unwrap();
        let mut fresh_text = updated_doc.create_text().unwrap();
        fresh_text.insert(0, "fresh summary").unwrap();
        fresh_para.insert("prop:text".to_owned(), fresh_text).unwrap();
        let mut blocks = updated_doc.get_or_create_map("blocks").unwrap();
        blocks.insert("para-fresh".to_owned(), fresh_para).unwrap();
      }
      let updated_page_bin = updated_doc.encode_state_as_update_v1(&sv).unwrap();
      sqlx::query(
        "INSERT INTO updates (workspace_id, guid, blob, created_at, created_by)
         VALUES ($1, 'doc-ordinary', $2, $3, $4)",
      )
      .bind(&ws_compact)
      .bind(&updated_page_bin)
      .bind(Utc::now())
      .bind(&user_id)
      .execute(db.pool())
      .await
      .unwrap();
      compact_pending_doc_updates(&db, &ws_compact, "doc-ordinary", 100, 0, 0)
        .await
        .expect("second compaction");
      let (title2, summary2, mode2, pub2): (Option<String>, Option<String>, i16, Option<DateTime<Utc>>) = sqlx::query_as(
        "SELECT title, summary, mode, published_at FROM workspace_pages WHERE workspace_id = $1 AND page_id = 'doc-ordinary'",
      )
      .bind(&ws_compact)
      .fetch_one(db.pool())
      .await
      .unwrap();
      assert_eq!(title2.as_deref(), Some("Updated Page Title"));
      assert_eq!(summary2.as_deref(), Some("fresh summary"));
      assert_eq!(mode2, 1);
      assert!(pub2.is_some());
    });
    drop(lease);
  }
}
