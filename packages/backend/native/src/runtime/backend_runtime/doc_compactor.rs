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
  embedding_schema_ready: bool,
}

impl DocCompactorStore {
  fn new(pool: PgPool, embedding_schema_ready: bool) -> Self {
    Self {
      pool,
      embedding_schema_ready,
    }
  }

  async fn compact_doc(
    &self,
    workspace_id: &str,
    doc_id: &str,
    batch_limit: i64,
    history_min_interval_ms: i64,
    history_max_age_seconds: i64,
  ) -> RuntimeResult<Option<(i64, bool)>> {
    compact_doc(
      self.pool.clone(),
      workspace_id,
      doc_id,
      batch_limit,
      history_min_interval_ms,
      history_max_age_seconds,
      self.embedding_schema_ready,
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
  allow_empty: bool,
) -> RuntimeResult<bool> {
  if !allow_empty && is_empty_doc(blob) {
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
  embedding_schema_ready: bool,
) -> RuntimeResult<Option<(i64, bool)>> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|err| RuntimeError::database("DocCompactor begin transaction failed", err))?;

  super::domain_command::lock_workspace_storage_shared(&mut tx, workspace_id).await?;

  let locked: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0))")
    .bind(format!("workspace-doc-update:{workspace_id}/{doc_id}"))
    .fetch_one(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("DocCompactor acquire document transaction lock failed", err))?;
  if !locked {
    tx.rollback()
      .await
      .map_err(|err| RuntimeError::database("DocCompactor rollback unlocked transaction failed", err))?;
    return Ok(None);
  }

  let snapshot = load_snapshot(&mut tx, workspace_id, doc_id).await?;
  let updates = load_updates(&mut tx, workspace_id, doc_id, batch_limit).await?;
  if updates.is_empty() {
    tx.commit()
      .await
      .map_err(|err| RuntimeError::database("DocCompactor commit transaction failed", err))?;
    return Ok(Some((0, false)));
  }

  super::domain_command::invalidate_doc_blob_projection(&mut tx, workspace_id, doc_id, embedding_schema_ready).await?;

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
    snapshot.is_none(),
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

  Ok(Some((deleted, history_created)))
}

#[napi_derive::napi]
impl BackendRuntime {
  /// Merge pending doc updates with y-octo and persist the merged snapshot.
  ///
  /// Do not use this for snapshots that will be sent back to yjs clients until
  /// the y-octo/yjs round-trip compatibility issue is resolved.
  ///
  /// The caller must pass the canonical history retention period resolved for
  /// this workspace. The compactor does not make quota decisions.
  #[napi]
  pub async fn compact_pending_doc_updates(
    &self,
    workspace_id: String,
    doc_id: String,
    batch_limit: i64,
    history_min_interval_ms: i64,
    history_max_age_seconds: i64,
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

    let Some((updates_merged, history_created)) =
      DocCompactorStore::new(self.pool().await?, self.embedding_schema_ready()?)
        .compact_doc(
          &workspace_id,
          &doc_id,
          batch_limit,
          history_min_interval_ms,
          history_max_age_seconds,
        )
        .await?
    else {
      return Ok(RuntimeDocCompactionResult {
        lock_acquired: false,
        merged: false,
        workspace_id,
        doc_id,
        updates_merged: 0,
        history_created: false,
      });
    };
    Ok(RuntimeDocCompactionResult {
      lock_acquired: true,
      merged: updates_merged > 0,
      workspace_id,
      doc_id,
      updates_merged,
      history_created,
    })
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::runtime::backend_runtime::tests::{pg_test_lock, runtime_from_database_url};

  async fn insert_workspace(pool: &PgPool, workspace_id: &str) {
    sqlx::query("INSERT INTO workspaces(id,created_at) VALUES($1,clock_timestamp())")
      .bind(workspace_id)
      .execute(pool)
      .await
      .unwrap();
  }

  #[tokio::test]
  async fn transaction_lock_serializes_compaction_and_missing_snapshot_is_supported() {
    let _guard = pg_test_lock().lock().await;
    let Some(runtime) = runtime_from_database_url().await.unwrap() else {
      return;
    };
    let pool = runtime.pool().await.unwrap();
    let workspace_id = format!("rust-test:compactor:{}", uuid::Uuid::new_v4());
    let doc_id = "doc";
    insert_workspace(&pool, &workspace_id).await;

    let update = Doc::default().encode_update_v1().unwrap();
    sqlx::query("INSERT INTO updates(workspace_id,guid,blob,created_at) VALUES($1,$2,$3,clock_timestamp())")
      .bind(&workspace_id)
      .bind(doc_id)
      .bind(update)
      .execute(&pool)
      .await
      .unwrap();

    let mut blocker = pool.begin().await.unwrap();
    let locked: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0))")
      .bind(format!("workspace-doc-update:{workspace_id}/{doc_id}"))
      .fetch_one(&mut *blocker)
      .await
      .unwrap();
    assert!(locked);

    let skipped = runtime
      .compact_pending_doc_updates(workspace_id.clone(), doc_id.to_string(), 100, 0, 3600)
      .await
      .unwrap();
    assert!(!skipped.lock_acquired);
    assert_eq!(
      sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM updates WHERE workspace_id=$1 AND guid=$2")
        .bind(&workspace_id)
        .bind(doc_id)
        .fetch_one(&pool)
        .await
        .unwrap(),
      1
    );

    blocker.rollback().await.unwrap();
    let compacted = runtime
      .compact_pending_doc_updates(workspace_id.clone(), doc_id.to_string(), 100, 0, 3600)
      .await
      .unwrap();
    assert!(compacted.lock_acquired);
    assert!(compacted.merged);
    assert_eq!(compacted.updates_merged, 1);
    assert!(
      sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM snapshots WHERE workspace_id=$1 AND guid=$2)")
        .bind(&workspace_id)
        .bind(doc_id)
        .fetch_one(&pool)
        .await
        .unwrap()
    );

    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
  }
}
