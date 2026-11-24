//! Document snapshot history listing, binary retrieval, collision-safe
//! recovery, background doc update compaction, and expired record housekeeping.

use std::sync::Arc;

use chrono::{DateTime, Duration, Utc};
use server_db::{ServerDb, WorkloadTier};
use server_spi::QuotaGate;
use server_types::DomainError;
use sqlx::{Postgres, Row, Transaction};

use crate::acl::load_workspace_docs_access_in;
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

    let limit = i64::from(take.unwrap_or(10).clamp(1, 100));
    let rows = sqlx::query(
      r#"SELECT sh.timestamp, u.name AS editor_name, u.avatar_url AS editor_avatar_url
         FROM snapshot_histories sh
         LEFT JOIN users u ON u.id = sh.created_by
         WHERE sh.workspace_id = $1
           AND sh.guid = $2
           AND sh.timestamp < $3
           AND sh.expired_at > $4
         ORDER BY sh.timestamp DESC
         LIMIT $5"#,
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .bind(before)
    .bind(now)
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
// Background doc compaction & housekeeping (ported 1:1 from doc_compactor.rs
// and housekeeping.rs).
// ---------------------------------------------------------------------------

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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DocCompactionOutcome {
  pub lock_acquired: bool,
  pub updates_merged: i64,
  pub history_created: bool,
}

/// Compacts pending rows in `updates` into `snapshots` (and optionally archives
/// the previous snapshot into `snapshot_histories`) under the per-doc advisory
/// lock `workspace-doc-update:<workspace_id>/<doc_id>`.
pub async fn compact_pending_doc_updates(
  db: &ServerDb,
  workspace_id: &str,
  doc_id: &str,
  batch_limit: i64,
  history_min_interval_ms: i64,
  history_max_age_seconds: i64,
) -> Result<DocCompactionOutcome, DomainError> {
  if batch_limit <= 0 {
    return Err(DomainError::Validation("batch_limit must be positive".to_owned()));
  }
  let mut tx = db
    .begin_tiered(WorkloadTier::LongQuery)
    .await
    .map_err(|e| DomainError::Internal(format!("begin doc compaction: {e}")))?;

  let ws_locked: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock_shared(hashtextextended($1, 0))")
    .bind(format!("storage-workspace:{workspace_id}"))
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("try lock workspace storage for compaction: {e}")))?;
  if !ws_locked {
    let _ = tx.rollback().await;
    return Ok(DocCompactionOutcome {
      lock_acquired: false,
      updates_merged: 0,
      history_created: false,
    });
  }

  let locked: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0))")
    .bind(format!("workspace-doc-update:{workspace_id}/{doc_id}"))
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("try lock doc compaction: {e}")))?;
  if !locked {
    let _ = tx.rollback().await;
    return Ok(DocCompactionOutcome {
      lock_acquired: false,
      updates_merged: 0,
      history_created: false,
    });
  }

  let deleted_doc: bool = sqlx::query_scalar(
    "SELECT COALESCE(lifecycle_state::text = 'deleted', false) FROM workspace_pages WHERE workspace_id = $1 AND page_id = $2",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(&mut **tx.tx_mut())
  .await
  .map_err(|e| DomainError::Internal(format!("check deleted doc before compaction: {e}")))?
  .unwrap_or(false);
  if deleted_doc {
    let _ = tx.rollback().await;
    return Ok(DocCompactionOutcome {
      lock_acquired: true,
      updates_merged: 0,
      history_created: false,
    });
  }

  let snapshot = sqlx::query_as::<_, (Vec<u8>, DateTime<Utc>, Option<String>)>(
    "SELECT blob, updated_at, updated_by FROM snapshots WHERE workspace_id = $1 AND guid = $2 FOR UPDATE",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(&mut **tx.tx_mut())
  .await
  .map_err(|e| DomainError::Internal(format!("load snapshot for compaction: {e}")))?
  .map(|(blob, updated_at, updated_by)| SnapshotRow {
    blob,
    updated_at,
    updated_by,
  });

  let updates: Vec<UpdateRow> = sqlx::query_as::<_, (Vec<u8>, DateTime<Utc>, Option<String>)>(
    "SELECT blob, created_at, created_by FROM updates WHERE workspace_id = $1 AND guid = $2 ORDER BY created_at ASC LIMIT $3 FOR UPDATE",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(batch_limit)
  .fetch_all(&mut **tx.tx_mut())
  .await
  .map_err(|e| DomainError::Internal(format!("load updates for compaction: {e}")))?
  .into_iter()
  .map(|(blob, created_at, created_by)| UpdateRow {
    blob,
    created_at,
    created_by,
  })
  .collect();

  if updates.is_empty() {
    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit empty compaction: {e}")))?;
    return Ok(DocCompactionOutcome {
      lock_acquired: true,
      updates_merged: 0,
      history_created: false,
    });
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
  .execute(&mut **tx.tx_mut())
  .await
  .map_err(|e| DomainError::Internal(format!("mark doc_blob_ref_projections pending: {e}")))?;

  let has_embedding_sources: bool = sqlx::query_scalar("SELECT to_regclass('public.embedding_sources') IS NOT NULL")
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("check embedding_sources table: {e}")))?;
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
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("invalidate embedding_sources: {e}")))?;
  }

  if workspace_id == doc_id {
    sqlx::query("UPDATE workspaces SET last_check_embeddings = '1970-01-01T00:00:00Z' WHERE id = $1")
      .bind(workspace_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("reset workspace last_check_embeddings: {e}")))?;
  }

  let last = updates.last().expect("updates non-empty");
  let mut merge_inputs = Vec::with_capacity(updates.len() + usize::from(snapshot.is_some()));
  if let Some(snap) = &snapshot {
    merge_inputs.push(snap.blob.clone());
  }
  merge_inputs.extend(updates.iter().map(|u| u.blob.clone()));

  let final_blob = if merge_inputs.len() == 1 {
    merge_inputs.remove(0)
  } else {
    y_octo::merge_updates_v1(merge_inputs)
      .and_then(|u| u.encode_v1())
      .map_err(|e| DomainError::Internal(format!("merge compaction updates: {e}")))?
  };

  let mut timestamp = snapshot
    .as_ref()
    .map_or(last.created_at, |s| s.updated_at.max(last.created_at));
  if snapshot
    .as_ref()
    .is_some_and(|s| s.updated_at >= last.created_at && s.blob != final_blob)
  {
    timestamp = next_doc_timestamp_in(tx.tx_mut(), workspace_id, doc_id).await?;
  }
  let editor = snapshot
    .as_ref()
    .filter(|s| s.updated_at > last.created_at)
    .and_then(|s| s.updated_by.as_deref())
    .or(last.created_by.as_deref());

  let persisted_at: Option<DateTime<Utc>> = if snapshot.is_none() {
    let first = updates.first().expect("updates non-empty");
    sqlx::query(
      r#"INSERT INTO runtime_doc_creators (workspace_id, doc_id, created_by, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (workspace_id, doc_id) DO NOTHING"#,
    )
    .bind(workspace_id)
    .bind(doc_id)
    .bind(first.created_by.as_deref())
    .bind(first.created_at)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("insert runtime_doc_creators: {e}")))?;

    let creator: Option<String> =
      sqlx::query_scalar("SELECT created_by FROM runtime_doc_creators WHERE workspace_id = $1 AND doc_id = $2")
        .bind(workspace_id)
        .bind(doc_id)
        .fetch_optional(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("load runtime_doc_creators: {e}")))?
        .flatten();

    sqlx::query_scalar(
      r#"INSERT INTO snapshots
           (workspace_id, guid, blob, size, created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (workspace_id, guid) DO NOTHING
         RETURNING updated_at"#,
    )
    .bind(workspace_id)
    .bind(doc_id)
    .bind(&final_blob)
    .bind(final_blob.len() as i64)
    .bind(first.created_at)
    .bind(timestamp)
    .bind(creator.as_deref())
    .bind(editor)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("insert compacted snapshot: {e}")))?
  } else {
    sqlx::query_scalar(
      r#"UPDATE snapshots
         SET blob = $3,
             size = $4,
             updated_at = $5,
             updated_by = $6
         WHERE workspace_id = $1
           AND guid = $2
           AND snapshots.updated_at <= $5
         RETURNING updated_at"#,
    )
    .bind(workspace_id)
    .bind(doc_id)
    .bind(&final_blob)
    .bind(final_blob.len() as i64)
    .bind(timestamp)
    .bind(editor)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("update compacted snapshot: {e}")))?
  };

  if persisted_at.is_none() {
    let _ = tx.rollback().await;
    return Ok(DocCompactionOutcome {
      lock_acquired: false,
      updates_merged: 0,
      history_created: false,
    });
  }

  let mut history_created = false;
  if let Some(snap) = &snapshot
    && history_max_age_seconds > 0
    && should_create_history_in(tx.tx_mut(), snap, workspace_id, doc_id, history_min_interval_ms).await?
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
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("insert compacted snapshot history: {e}")))?;
    history_created = true;
  }

  let timestamps: Vec<DateTime<Utc>> = updates.iter().map(|u| u.created_at).collect();
  let deleted = sqlx::query("DELETE FROM updates WHERE workspace_id = $1 AND guid = $2 AND created_at = ANY($3)")
    .bind(workspace_id)
    .bind(doc_id)
    .bind(&timestamps)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("delete compacted updates: {e}")))?
    .rows_affected() as i64;

  tx.commit()
    .await
    .map_err(|e| DomainError::Internal(format!("commit doc compaction: {e}")))?;

  Ok(DocCompactionOutcome {
    lock_acquired: true,
    updates_merged: deleted,
    history_created,
  })
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
  snapshot: &SnapshotRow,
  workspace_id: &str,
  doc_id: &str,
  history_min_interval_ms: i64,
) -> Result<bool, DomainError> {
  if is_empty_doc_bin(&snapshot.blob) {
    return Ok(false);
  }
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
  if last_ts == snapshot.updated_at {
    return Ok(false);
  }
  let threshold = snapshot.updated_at - Duration::milliseconds(history_min_interval_ms.max(0));
  Ok(last_ts < threshold)
}

/// Scans pending `(workspace_id, guid)` pairs in `updates` and compacts up to
/// `max_docs` documents while respecting each workspace's `history_period_seconds`
/// quota and checking `is_cancelled` between documents.
pub async fn compact_pending_docs_batch(
  db: &ServerDb,
  quota_gate: &dyn QuotaGate,
  max_docs: i64,
  batch_limit: i64,
  history_min_interval_ms: i64,
  is_cancelled: impl Fn() -> bool,
) -> Result<usize, DomainError> {
  let pairs: Vec<(String, String)> = {
    let mut conn = db
      .acquire_tiered(WorkloadTier::LongQuery)
      .await
      .map_err(|e| DomainError::Unavailable(format!("acquire pending update docs: {e}")))?;
    sqlx::query_as(
      r#"SELECT workspace_id, guid
         FROM updates
         GROUP BY workspace_id, guid
         ORDER BY MIN(created_at) ASC, workspace_id ASC, guid ASC
         LIMIT $1"#,
    )
    .bind(max_docs.clamp(1, 500))
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("list pending update docs: {e}")))?
  };

  let mut compacted = 0usize;
  for (workspace_id, doc_id) in pairs {
    if is_cancelled() {
      break;
    }
    let mut tx = db
      .begin_tiered(WorkloadTier::LongQuery)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin quota lookup for compaction: {e}")))?;
    let history_secs = match quota_gate
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

      // 2. Stale snapshot guard: simulate concurrent snapshot row with newer updated_at
      //    arriving after snapshot load; compaction must roll back and preserve all updates.
      sqlx::query(
        "INSERT INTO doc_blob_ref_projections (workspace_id, doc_id, source_revision, parser_version, status, indexed_at) VALUES ($1, $2, clock_timestamp(), 1, 'fresh', clock_timestamp())",
      )
      .bind(&ws_id)
      .bind(doc2)
      .execute(db.pool())
      .await
      .expect("insert doc2 projection");
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
      sqlx::raw_sql(&format!(
        r#"CREATE OR REPLACE FUNCTION inject_concurrent_snapshot() RETURNS trigger AS $$
           BEGIN
             IF NEW.doc_id = '{doc2}' THEN
               INSERT INTO snapshots (workspace_id, guid, blob, size, created_at, updated_at)
               VALUES (NEW.workspace_id, NEW.doc_id, E'\\x0000', 2, now(), now() + interval '10 minutes')
               ON CONFLICT (workspace_id, guid) DO UPDATE SET updated_at = EXCLUDED.updated_at;
             END IF;
             RETURN NEW;
           END;
           $$ LANGUAGE plpgsql;
           CREATE TRIGGER trg_inject_concurrent_snapshot
             AFTER UPDATE ON doc_blob_ref_projections
             FOR EACH ROW EXECUTE FUNCTION inject_concurrent_snapshot();"#
      ))
      .execute(db.pool())
      .await
      .expect("create fault trigger");

      let stale_outcome = compact_pending_doc_updates(&db, &ws_id, doc2, 100, 0, 0)
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
}
