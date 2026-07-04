use chrono::{DateTime, Duration, Utc};
use sqlx::{FromRow, PgPool, Postgres, Row, Transaction};
use y_octo::Doc;

use super::{BackendRuntime, RuntimeError, RuntimeResult, napi_error, types::RuntimeDocCompactionResult};

#[derive(FromRow)]
struct SnapshotRow {
  blob: Vec<u8>,
  updated_at: DateTime<Utc>,
  updated_by: Option<String>,
}

#[derive(FromRow)]
struct UpdateRow {
  blob: Vec<u8>,
  created_at: DateTime<Utc>,
  created_by: Option<String>,
}

struct DocCompactorStore {
  pool: PgPool,
}

impl DocCompactorStore {
  fn new(pool: PgPool) -> Self {
    Self { pool }
  }

  async fn compact_doc(
    &self,
    workspace_id: &str,
    doc_id: &str,
    batch_limit: i64,
    history_min_interval_ms: i64,
    history_max_age_seconds: i64,
  ) -> RuntimeResult<(i64, bool)> {
    compact_doc(
      self.pool.clone(),
      workspace_id,
      doc_id,
      batch_limit,
      history_min_interval_ms,
      history_max_age_seconds,
    )
    .await
  }
}

fn is_empty_doc(bin: &[u8]) -> bool {
  bin.is_empty() || (bin.len() == 1 && bin[0] == 0) || (bin.len() == 2 && bin[0] == 0 && bin[1] == 0)
}

fn apply_updates(updates: impl IntoIterator<Item = Vec<u8>>) -> RuntimeResult<Vec<u8>> {
  let mut doc = Doc::default();
  for update in updates {
    doc
      .apply_update_from_binary_v1(&update)
      .map_err(|err| RuntimeError::invalid_state(format!("DocCompactor merge failed: {err}")))?;
  }
  doc
    .encode_update_v1()
    .map_err(|err| RuntimeError::invalid_state(format!("DocCompactor encode failed: {err}")))
}

fn checked_milliseconds(value: i64, field: &str) -> RuntimeResult<Duration> {
  Duration::try_milliseconds(value)
    .ok_or_else(|| RuntimeError::invalid_input(format!("DocCompactor {field} is too large")))
}

fn checked_seconds(value: i64, field: &str) -> RuntimeResult<Duration> {
  Duration::try_seconds(value).ok_or_else(|| RuntimeError::invalid_input(format!("DocCompactor {field} is too large")))
}

async fn load_snapshot(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<Option<SnapshotRow>> {
  sqlx::query_as::<_, SnapshotRow>(
    r#"
    SELECT blob, updated_at, updated_by
    FROM snapshots
    WHERE workspace_id = $1 AND guid = $2
    FOR UPDATE
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("DocCompactor load snapshot failed", err))
}

async fn load_updates(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
  batch_limit: i64,
) -> RuntimeResult<Vec<UpdateRow>> {
  sqlx::query_as::<_, UpdateRow>(
    r#"
    SELECT blob, created_at, created_by
    FROM updates
    WHERE workspace_id = $1 AND guid = $2
    ORDER BY created_at ASC
    LIMIT $3
    FOR UPDATE
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(batch_limit)
  .fetch_all(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("DocCompactor load updates failed", err))
}

async fn upsert_snapshot(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
  blob: &[u8],
  timestamp: DateTime<Utc>,
  editor: Option<&str>,
) -> RuntimeResult<bool> {
  if is_empty_doc(blob) {
    return Ok(false);
  }

  let row = sqlx::query(
    r#"
    INSERT INTO snapshots
      (workspace_id, guid, blob, size, created_at, updated_at, created_by, updated_by)
    VALUES
      ($1, $2, $3, $4, $5, $5, $6, $6)
    ON CONFLICT (workspace_id, guid)
    DO UPDATE SET
      blob = $3,
      size = $4,
      updated_at = $5,
      updated_by = $6
    WHERE snapshots.workspace_id = $1
      AND snapshots.guid = $2
      AND snapshots.updated_at <= $5
    RETURNING updated_at
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(blob)
  .bind(blob.len() as i64)
  .bind(timestamp)
  .bind(editor)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("DocCompactor upsert snapshot failed", err))?;

  Ok(row.is_some())
}

async fn should_create_history(
  tx: &mut Transaction<'_, Postgres>,
  snapshot: &SnapshotRow,
  workspace_id: &str,
  doc_id: &str,
  history_min_interval_ms: i64,
) -> RuntimeResult<bool> {
  if is_empty_doc(&snapshot.blob) {
    return Ok(false);
  }

  let row = sqlx::query(
    r#"
    SELECT timestamp
    FROM snapshot_histories
    WHERE workspace_id = $1 AND guid = $2
    ORDER BY timestamp DESC
    LIMIT 1
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("DocCompactor load latest history failed", err))?;

  let Some(row) = row else {
    return Ok(true);
  };

  let last_timestamp: DateTime<Utc> = row.get("timestamp");
  if last_timestamp == snapshot.updated_at {
    return Ok(false);
  }

  let min_interval = checked_milliseconds(history_min_interval_ms, "history interval")?;
  let threshold = snapshot
    .updated_at
    .checked_sub_signed(min_interval)
    .ok_or_else(|| RuntimeError::invalid_input("DocCompactor history interval is out of range"))?;

  Ok(last_timestamp < threshold)
}

async fn create_history(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
  snapshot: &SnapshotRow,
  max_age_seconds: i64,
) -> RuntimeResult<bool> {
  if max_age_seconds <= 0 {
    return Ok(false);
  }

  let max_age = checked_seconds(max_age_seconds, "history max age")?;
  let expired_at = Utc::now()
    .checked_add_signed(max_age)
    .ok_or_else(|| RuntimeError::invalid_input("DocCompactor history max age is out of range"))?;
  sqlx::query(
    r#"
    INSERT INTO snapshot_histories
      (workspace_id, guid, timestamp, blob, expired_at, created_by)
    VALUES
      ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (workspace_id, guid, timestamp)
    DO UPDATE SET expired_at = EXCLUDED.expired_at
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(snapshot.updated_at)
  .bind(&snapshot.blob)
  .bind(expired_at)
  .bind(snapshot.updated_by.as_deref())
  .execute(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("DocCompactor create history failed", err))?;

  Ok(true)
}

async fn delete_updates(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
  timestamps: &[DateTime<Utc>],
) -> RuntimeResult<i64> {
  let result = sqlx::query(
    r#"
    DELETE FROM updates
    WHERE workspace_id = $1
      AND guid = $2
      AND created_at = ANY($3)
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(timestamps)
  .execute(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("DocCompactor delete updates failed", err))?;

  Ok(result.rows_affected() as i64)
}

async fn compact_doc(
  pool: PgPool,
  workspace_id: &str,
  doc_id: &str,
  batch_limit: i64,
  history_min_interval_ms: i64,
  history_max_age_seconds: i64,
) -> RuntimeResult<(i64, bool)> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|err| RuntimeError::database("DocCompactor begin transaction failed", err))?;

  let snapshot = load_snapshot(&mut tx, workspace_id, doc_id).await?;
  let updates = load_updates(&mut tx, workspace_id, doc_id, batch_limit).await?;
  if updates.is_empty() {
    tx.commit()
      .await
      .map_err(|err| RuntimeError::database("DocCompactor commit transaction failed", err))?;
    return Ok((0, false));
  }

  let last = updates.last().expect("updates is not empty");
  let mut merge_inputs = Vec::with_capacity(updates.len() + usize::from(snapshot.is_some()));
  if let Some(snapshot) = &snapshot {
    merge_inputs.push(snapshot.blob.clone());
  }
  merge_inputs.extend(updates.iter().map(|update| update.blob.clone()));

  let final_blob = if merge_inputs.len() == 1 {
    merge_inputs.remove(0)
  } else {
    apply_updates(merge_inputs)?
  };

  let snapshot_updated = upsert_snapshot(
    &mut tx,
    workspace_id,
    doc_id,
    &final_blob,
    last.created_at,
    last.created_by.as_deref(),
  )
  .await?;

  let mut history_created = false;
  if snapshot_updated
    && let Some(snapshot) = &snapshot
    && should_create_history(&mut tx, snapshot, workspace_id, doc_id, history_min_interval_ms).await?
  {
    history_created = create_history(&mut tx, workspace_id, doc_id, snapshot, history_max_age_seconds).await?;
  }

  let timestamps = updates.iter().map(|update| update.created_at).collect::<Vec<_>>();
  let deleted = delete_updates(&mut tx, workspace_id, doc_id, &timestamps).await?;

  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("DocCompactor commit transaction failed", err))?;

  Ok((deleted, history_created))
}

#[napi_derive::napi]
impl BackendRuntime {
  /// Merge pending doc updates with y-octo and persist the merged snapshot.
  ///
  /// Do not use this for snapshots that will be sent back to yjs clients until
  /// the y-octo/yjs round-trip compatibility issue is resolved.
  ///
  /// The caller owns quota reconciliation and must pass a fresh
  /// history_max_age_seconds value. The compactor intentionally does not read
  /// effective_workspace_quota_states; if a future caller cannot provide a
  /// fresh quota state, fail and retry after Node reconciles it.
  #[napi]
  #[allow(clippy::too_many_arguments)]
  pub async fn compact_pending_doc_updates(
    &self,
    workspace_id: String,
    doc_id: String,
    batch_limit: i64,
    history_min_interval_ms: i64,
    history_max_age_seconds: i64,
    owner: String,
    lease_ttl_ms: i64,
  ) -> napi::Result<RuntimeDocCompactionResult> {
    if batch_limit <= 0 {
      return Err(napi_error("doc compactor batch limit must be positive"));
    }
    if history_min_interval_ms < 0 {
      return Err(napi_error("doc compactor history interval must be non-negative"));
    }
    if history_max_age_seconds < 0 {
      return Err(napi_error("doc compactor history max age must be non-negative"));
    }
    checked_milliseconds(history_min_interval_ms, "history interval")?;
    if history_max_age_seconds > 0 {
      let max_age = checked_seconds(history_max_age_seconds, "history max age")?;
      Utc::now()
        .checked_add_signed(max_age)
        .ok_or_else(|| RuntimeError::invalid_input("DocCompactor history max age is out of range"))?;
    }

    let lease_key = format!("doc:update:{workspace_id}:{doc_id}");
    let Some(lease) = self.acquire_coordination_lease(lease_key, owner, lease_ttl_ms).await? else {
      return Ok(RuntimeDocCompactionResult {
        lease_acquired: false,
        merged: false,
        workspace_id,
        doc_id,
        updates_merged: 0,
        history_created: false,
      });
    };

    let result = DocCompactorStore::new(self.pool().await?)
      .compact_doc(
        &workspace_id,
        &doc_id,
        batch_limit,
        history_min_interval_ms,
        history_max_age_seconds,
      )
      .await;

    let released = self
      .release_coordination_lease(lease.key, lease.owner, lease.fencing_token)
      .await?;
    if !released {
      return Err(RuntimeError::invalid_state("DocCompactor failed to release coordination lease").into());
    }

    let (updates_merged, history_created) = result?;
    Ok(RuntimeDocCompactionResult {
      lease_acquired: true,
      merged: updates_merged > 0,
      workspace_id,
      doc_id,
      updates_merged,
      history_created,
    })
  }
}
