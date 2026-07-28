use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::{FromRow, PgPool, Postgres, Row, Transaction};
use uuid::Uuid;

use super::{
  CurrentDoc, CurrentDocUpdate, RuntimeDocumentCleanupAckResult, RuntimeDocumentCleanupEffect,
  RuntimeDocumentCleanupExecuteResult, RuntimeDocumentCleanupReconcileResult, RuntimeError, RuntimeResult,
  StorageRuntime, load_workspace_live_doc_ids, merge_current_doc, napi_error,
};

#[derive(FromRow)]
struct StoredDocActivity {
  doc_id: String,
  last_activity_at: DateTime<Utc>,
}

#[derive(FromRow)]
struct Candidate {
  workspace_id: String,
  doc_id: String,
  last_doc_activity_at: Option<DateTime<Utc>>,
}

#[derive(FromRow)]
struct PendingEffect {
  workspace_id: String,
  doc_id: String,
  cleanup_payload: Value,
}

async fn load_stored_doc_activity(pool: &PgPool, workspace_id: &str) -> RuntimeResult<Vec<StoredDocActivity>> {
  sqlx::query_as::<_, StoredDocActivity>(
    r#"
    SELECT doc_id, MAX(activity_at) AS last_activity_at
    FROM (
      SELECT guid AS doc_id, updated_at AS activity_at FROM snapshots WHERE workspace_id = $1
      UNION ALL
      SELECT guid, created_at FROM updates WHERE workspace_id = $1
      UNION ALL
      SELECT guid, timestamp FROM snapshot_histories WHERE workspace_id = $1
    ) stored
    WHERE doc_id <> $1
    GROUP BY doc_id
    ORDER BY doc_id
    "#,
  )
  .bind(workspace_id)
  .fetch_all(pool)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup stored doc scan failed", err))
}

async fn record_reconcile_failure(
  pool: &PgPool,
  workspace_id: &str,
  failure_kind: &str,
  error: &str,
) -> RuntimeResult<()> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|err| RuntimeError::database("Document cleanup failure transaction failed", err))?;
  let root_failed = i32::from(failure_kind == "root");
  let doc_failed = i32::from(failure_kind == "doc");
  sqlx::query(
    r#"
    INSERT INTO storage_reconciliation_checkpoints (kind, scope, status, cursor, completed_at, metadata)
    VALUES ('document_cleanup', $1, 'failed', '{}', NULL, $2)
    ON CONFLICT (kind, scope) DO UPDATE
      SET status = 'failed', cursor = '{}', completed_at = NULL,
          updated_at = CURRENT_TIMESTAMP, metadata = EXCLUDED.metadata
    "#,
  )
  .bind(workspace_id)
  .bind(json!({
    "checkpointCompleted": false,
    "failureKind": failure_kind,
    "rootFailed": root_failed,
    "docFailed": doc_failed,
    "error": error,
  }))
  .execute(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup failure checkpoint write failed", err))?;
  sqlx::query(
    r#"
    INSERT INTO storage_reconciliation_runs
      (kind, mode, status, workspace_id, finished_at, failed, metadata)
    VALUES ('document_cleanup', 'mark_only', 'failed', $1, CURRENT_TIMESTAMP, 1, $2)
    "#,
  )
  .bind(workspace_id)
  .bind(json!({
    "checkpointCompleted": false,
    "failureKind": failure_kind,
    "rootFailed": root_failed,
    "docFailed": doc_failed,
    "error": error,
  }))
  .execute(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup failure run write failed", err))?;
  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("Document cleanup failure commit failed", err))?;
  Ok(())
}

async fn reconcile_workspace(
  runtime: &StorageRuntime,
  workspace_id: &str,
) -> RuntimeResult<RuntimeDocumentCleanupReconcileResult> {
  let pool = runtime.pool().await?;
  let live_ids = match load_workspace_live_doc_ids(&pool, workspace_id).await {
    Ok(ids) => ids.into_iter().collect::<HashSet<_>>(),
    Err(err) => {
      record_reconcile_failure(&pool, workspace_id, "root", &err.to_string()).await?;
      return Err(err);
    }
  };
  let stored = match load_stored_doc_activity(&pool, workspace_id).await {
    Ok(stored) => stored,
    Err(err) => {
      record_reconcile_failure(&pool, workspace_id, "scan", &err.to_string()).await?;
      return Err(err);
    }
  };

  let mut tx = pool
    .begin()
    .await
    .map_err(|err| RuntimeError::database("Document cleanup reconcile transaction failed", err))?;
  let now = Utc::now();
  let mut result = RuntimeDocumentCleanupReconcileResult {
    scanned_docs: stored.len() as i64,
    marked: 0,
    reset: 0,
    recovered: 0,
  };

  for doc in &stored {
    if live_ids.contains(&doc.doc_id) {
      continue;
    }
    let existing = sqlx::query(
      r#"
      SELECT status, last_doc_activity_at
      FROM document_cleanup_candidates
      WHERE workspace_id = $1 AND doc_id = $2
      "#,
    )
    .bind(workspace_id)
    .bind(&doc.doc_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("Document cleanup candidate load failed", err))?;
    sqlx::query(
      r#"
      INSERT INTO document_cleanup_candidates
        (workspace_id, doc_id, status, missing_since, last_observed_missing_at, last_doc_activity_at)
      VALUES ($1, $2, 'marked', $3, $3, $4)
      ON CONFLICT (workspace_id, doc_id) DO UPDATE
        SET status = CASE
              WHEN document_cleanup_candidates.status = 'effects_pending' THEN 'effects_pending'
              ELSE 'marked'
            END,
            missing_since = CASE
              WHEN document_cleanup_candidates.status = 'effects_pending' THEN document_cleanup_candidates.missing_since
              WHEN document_cleanup_candidates.last_doc_activity_at IS DISTINCT FROM EXCLUDED.last_doc_activity_at
                THEN EXCLUDED.missing_since
              ELSE document_cleanup_candidates.missing_since
            END,
            last_observed_missing_at = EXCLUDED.last_observed_missing_at,
            last_doc_activity_at = EXCLUDED.last_doc_activity_at,
            error = CASE WHEN document_cleanup_candidates.status = 'effects_pending'
              THEN document_cleanup_candidates.error ELSE NULL END,
            updated_at = CURRENT_TIMESTAMP
      "#,
    )
    .bind(workspace_id)
    .bind(&doc.doc_id)
    .bind(now)
    .bind(doc.last_activity_at)
    .execute(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("Document cleanup candidate upsert failed", err))?;
    match existing {
      None => result.marked += 1,
      Some(row)
        if row.get::<String, _>("status") != "effects_pending"
          && row.get::<Option<DateTime<Utc>>, _>("last_doc_activity_at") != Some(doc.last_activity_at) =>
      {
        result.reset += 1;
      }
      Some(_) => {}
    }
  }

  let live_ids = live_ids.into_iter().collect::<Vec<_>>();
  result.recovered = sqlx::query(
    r#"
    DELETE FROM document_cleanup_candidates
    WHERE workspace_id = $1
      AND status IN ('marked', 'failed')
      AND doc_id = ANY($2)
    "#,
  )
  .bind(workspace_id)
  .bind(&live_ids)
  .execute(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup recovered candidate delete failed", err))?
  .rows_affected() as i64;

  sqlx::query(
    r#"
    INSERT INTO storage_reconciliation_checkpoints (kind, scope, status, cursor, completed_at, metadata)
    VALUES ('document_cleanup', $1, 'completed', '{}', CURRENT_TIMESTAMP, $2)
    ON CONFLICT (kind, scope) DO UPDATE
      SET status = 'completed', cursor = '{}', completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP, metadata = EXCLUDED.metadata
    "#,
  )
  .bind(workspace_id)
  .bind(json!({
    "scannedDocs": result.scanned_docs,
    "marked": result.marked,
    "reset": result.reset,
    "recovered": result.recovered,
    "rootFailed": 0,
    "docFailed": 0,
    "checkpointCompleted": true,
  }))
  .execute(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup checkpoint write failed", err))?;
  sqlx::query(
    r#"
    INSERT INTO storage_reconciliation_runs
      (kind, mode, status, workspace_id, finished_at, scanned, changed, metadata)
    VALUES ('document_cleanup', 'mark_only', 'finished', $1, CURRENT_TIMESTAMP, $2, $3, $4)
    "#,
  )
  .bind(workspace_id)
  .bind(result.scanned_docs as i32)
  .bind((result.marked + result.reset + result.recovered) as i32)
  .bind(json!({
    "reset": result.reset,
    "recovered": result.recovered,
    "rootFailed": 0,
    "docFailed": 0,
    "checkpointCompleted": true,
  }))
  .execute(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup run write failed", err))?;
  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("Document cleanup reconcile commit failed", err))?;

  Ok(result)
}

async fn load_current_doc_for_update(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<Option<CurrentDoc>> {
  let snapshot = sqlx::query_as::<_, CurrentDoc>(
    "SELECT workspace_id, guid AS doc_id, blob, updated_at FROM snapshots WHERE workspace_id = $1 AND guid = $2",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup current snapshot load failed", err))?;
  let updates = sqlx::query_as::<_, CurrentDocUpdate>(
    "SELECT blob, created_at FROM updates WHERE workspace_id = $1 AND guid = $2 ORDER BY created_at ASC",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_all(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup current updates load failed", err))?;
  merge_current_doc(workspace_id, doc_id, snapshot, updates)
}

async fn current_activity(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<Option<DateTime<Utc>>> {
  sqlx::query_scalar::<_, Option<DateTime<Utc>>>(
    r#"
    SELECT MAX(activity_at)
    FROM (
      SELECT updated_at AS activity_at FROM snapshots WHERE workspace_id = $1 AND guid = $2
      UNION ALL SELECT created_at FROM updates WHERE workspace_id = $1 AND guid = $2
      UNION ALL SELECT timestamp FROM snapshot_histories WHERE workspace_id = $1 AND guid = $2
    ) activity
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_one(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup activity load failed", err))
}

fn root_contains(root: CurrentDoc, doc_id: &str) -> RuntimeResult<bool> {
  let projection = affine_doc_loader::project_workspace_root(root.blob, true)
    .map_err(|err| RuntimeError::invalid_state(format!("Document cleanup root parse failed: {err}")))?;
  if !projection.complete {
    return Err(RuntimeError::invalid_state("Document cleanup root doc is incomplete"));
  }
  Ok(projection.doc_ids.iter().any(|id| id == doc_id))
}

async fn delete_doc_rows(tx: &mut Transaction<'_, Postgres>, candidate: &Candidate) -> RuntimeResult<i64> {
  let attachment_keys = sqlx::query_scalar::<_, String>(
    "SELECT key FROM comment_attachments WHERE workspace_id = $1 AND doc_id = $2 ORDER BY key",
  )
  .bind(&candidate.workspace_id)
  .bind(&candidate.doc_id)
  .fetch_all(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup attachment key load failed", err))?;
  let cleanup_version = Uuid::new_v4().to_string();
  let storage_bytes = sqlx::query(
    r#"
    SELECT
      COALESCE((SELECT SUM(octet_length(blob)) FROM snapshots WHERE workspace_id = $1 AND guid = $2), 0)::bigint AS snapshot_bytes,
      COALESCE((SELECT SUM(octet_length(blob)) FROM updates WHERE workspace_id = $1 AND guid = $2), 0)::bigint AS update_bytes,
      COALESCE((SELECT SUM(octet_length(blob)) FROM snapshot_histories WHERE workspace_id = $1 AND guid = $2), 0)::bigint AS history_bytes
    "#,
  )
  .bind(&candidate.workspace_id)
  .bind(&candidate.doc_id)
  .fetch_one(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup storage bytes load failed", err))?;
  let mut row_counts = HashMap::<String, i64>::new();
  row_counts.insert(
    "ai_workspace_embeddings".to_string(),
    sqlx::query_scalar::<_, i64>(
      "SELECT COUNT(*) FROM ai_workspace_embeddings WHERE workspace_id = $1 AND doc_id = $2",
    )
    .bind(&candidate.workspace_id)
    .bind(&candidate.doc_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(|err| RuntimeError::database("Document cleanup embedding cascade count failed", err))?,
  );
  row_counts.insert(
    "replies".to_string(),
    sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM replies WHERE workspace_id = $1 AND doc_id = $2")
      .bind(&candidate.workspace_id)
      .bind(&candidate.doc_id)
      .fetch_one(&mut **tx)
      .await
      .map_err(|err| RuntimeError::database("Document cleanup reply cascade count failed", err))?,
  );
  let mut deleted_rows = 0;
  for (table, doc_column) in [
    ("workspace_pages", "page_id"),
    ("doc_access_policies", "doc_id"),
    ("doc_grants", "doc_id"),
    ("doc_blob_refs", "doc_id"),
    ("ai_workspace_ignored_docs", "doc_id"),
    ("comments", "doc_id"),
    ("comment_attachments", "doc_id"),
    ("workspace_doc_view_daily", "doc_id"),
  ] {
    let query = format!("DELETE FROM {table} WHERE workspace_id = $1 AND {doc_column} = $2");
    let affected = sqlx::query(&query)
      .bind(&candidate.workspace_id)
      .bind(&candidate.doc_id)
      .execute(&mut **tx)
      .await
      .map_err(|err| RuntimeError::database(format!("Document cleanup {table} delete failed"), err))?
      .rows_affected() as i64;
    deleted_rows += affected;
    row_counts.insert(table.to_string(), affected);
  }
  for (table, doc_column) in [
    ("workspace_member_last_access", "last_doc_id"),
    ("ai_sessions_metadata", "doc_id"),
    ("ai_action_runs", "doc_id"),
  ] {
    let query = format!("UPDATE {table} SET {doc_column} = NULL WHERE workspace_id = $1 AND {doc_column} = $2");
    let affected = sqlx::query(&query)
      .bind(&candidate.workspace_id)
      .bind(&candidate.doc_id)
      .execute(&mut **tx)
      .await
      .map_err(|err| RuntimeError::database(format!("Document cleanup {table} unlink failed"), err))?
      .rows_affected() as i64;
    deleted_rows += affected;
    row_counts.insert(format!("{table}.set_null"), affected);
  }
  for table in ["updates", "snapshot_histories", "snapshots"] {
    let affected = sqlx::query(&format!("DELETE FROM {table} WHERE workspace_id = $1 AND guid = $2"))
      .bind(&candidate.workspace_id)
      .bind(&candidate.doc_id)
      .execute(&mut **tx)
      .await
      .map_err(|err| RuntimeError::database(format!("Document cleanup {table} delete failed"), err))?
      .rows_affected() as i64;
    deleted_rows += affected;
    row_counts.insert(table.to_string(), affected);
  }

  sqlx::query(
    r#"
    UPDATE document_cleanup_candidates
    SET status = 'effects_pending', cleanup_payload = $3, error = NULL,
        attempt_count = 0, updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = $1 AND doc_id = $2
    "#,
  )
  .bind(&candidate.workspace_id)
  .bind(&candidate.doc_id)
  .bind(json!({
    "cleanupVersion": cleanup_version,
    "commentAttachmentKeys": attachment_keys,
    "commentObjectsDone": false,
    "searchDone": false,
    "copilotDone": false,
  }))
  .execute(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup candidate effect transition failed", err))?;
  sqlx::query(
    r#"
    INSERT INTO storage_reconciliation_runs
      (kind, mode, status, workspace_id, finished_at, scanned, changed, metadata)
    VALUES ('document_cleanup_execute', 'execute', 'finished', $1, CURRENT_TIMESTAMP, 1, $2, $3)
    "#,
  )
  .bind(&candidate.workspace_id)
  .bind(deleted_rows as i32)
  .bind(json!({
    "docId": candidate.doc_id,
    "cleanupVersion": cleanup_version,
    "rowCounts": row_counts,
    "snapshotBytes": storage_bytes.get::<i64, _>("snapshot_bytes"),
    "updateBytes": storage_bytes.get::<i64, _>("update_bytes"),
    "historyBytes": storage_bytes.get::<i64, _>("history_bytes"),
  }))
  .execute(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup execute audit write failed", err))?;
  Ok(deleted_rows)
}

async fn mark_candidate_failed(
  tx: &mut Transaction<'_, Postgres>,
  candidate: &Candidate,
  error: String,
) -> RuntimeResult<()> {
  sqlx::query(
    r#"
    UPDATE document_cleanup_candidates
    SET status = 'failed', attempt_count = attempt_count + 1,
        error = $3, updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = $1 AND doc_id = $2
    "#,
  )
  .bind(&candidate.workspace_id)
  .bind(&candidate.doc_id)
  .bind(&error)
  .execute(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup candidate failure write failed", err))?;
  sqlx::query(
    r#"
    INSERT INTO storage_reconciliation_runs
      (kind, mode, status, workspace_id, finished_at, scanned, failed, metadata)
    VALUES ('document_cleanup_execute', 'execute', 'failed', $1, CURRENT_TIMESTAMP, 1, 1, $2)
    "#,
  )
  .bind(&candidate.workspace_id)
  .bind(json!({
    "docId": candidate.doc_id,
    "error": error,
  }))
  .execute(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup execute failure audit write failed", err))?;
  Ok(())
}

async fn execute_one(
  pool: &PgPool,
  workspace_id: Option<&str>,
  grace_period_days: i64,
) -> RuntimeResult<Option<(Candidate, i64)>> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|err| RuntimeError::database("Document cleanup execute transaction failed", err))?;
  sqlx::query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
    .execute(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("Document cleanup isolation setup failed", err))?;
  let candidate = sqlx::query_as::<_, Candidate>(
    r#"
    SELECT workspace_id, doc_id, last_doc_activity_at
    FROM document_cleanup_candidates
    WHERE (status = 'marked'
        OR (status = 'failed' AND updated_at <= CURRENT_TIMESTAMP - INTERVAL '5 minutes'))
      AND ($1::text IS NULL OR workspace_id = $1)
      AND missing_since <= CURRENT_TIMESTAMP - make_interval(days => $2::int)
    ORDER BY missing_since, workspace_id, doc_id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
    "#,
  )
  .bind(workspace_id)
  .bind(grace_period_days as i32)
  .fetch_optional(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup candidate claim failed", err))?;
  let Some(candidate) = candidate else {
    tx.rollback()
      .await
      .map_err(|err| RuntimeError::database("Document cleanup empty claim rollback failed", err))?;
    return Ok(None);
  };

  let root = match load_current_doc_for_update(&mut tx, &candidate.workspace_id, &candidate.workspace_id).await {
    Ok(Some(root)) => root,
    Ok(None) => {
      mark_candidate_failed(
        &mut tx,
        &candidate,
        "Workspace root doc is missing during document cleanup execute".to_string(),
      )
      .await?;
      tx.commit()
        .await
        .map_err(|err| RuntimeError::database("Document cleanup failed candidate commit failed", err))?;
      return Ok(Some((candidate, -3)));
    }
    Err(err) => {
      mark_candidate_failed(&mut tx, &candidate, err.to_string()).await?;
      tx.commit()
        .await
        .map_err(|err| RuntimeError::database("Document cleanup failed candidate commit failed", err))?;
      return Ok(Some((candidate, -3)));
    }
  };
  let contains = match root_contains(root, &candidate.doc_id) {
    Ok(contains) => contains,
    Err(err) => {
      mark_candidate_failed(&mut tx, &candidate, err.to_string()).await?;
      tx.commit()
        .await
        .map_err(|err| RuntimeError::database("Document cleanup failed candidate commit failed", err))?;
      return Ok(Some((candidate, -3)));
    }
  };
  if contains {
    sqlx::query("DELETE FROM document_cleanup_candidates WHERE workspace_id = $1 AND doc_id = $2")
      .bind(&candidate.workspace_id)
      .bind(&candidate.doc_id)
      .execute(&mut *tx)
      .await
      .map_err(|err| RuntimeError::database("Document cleanup recovered candidate delete failed", err))?;
    tx.commit()
      .await
      .map_err(|err| RuntimeError::database("Document cleanup recovered candidate commit failed", err))?;
    return Ok(Some((candidate, -1)));
  }
  let activity = current_activity(&mut tx, &candidate.workspace_id, &candidate.doc_id).await?;
  if activity != candidate.last_doc_activity_at {
    sqlx::query(
      r#"
      UPDATE document_cleanup_candidates
      SET status = 'marked', missing_since = CURRENT_TIMESTAMP,
          last_observed_missing_at = CURRENT_TIMESTAMP, last_doc_activity_at = $3,
          error = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = $1 AND doc_id = $2
      "#,
    )
    .bind(&candidate.workspace_id)
    .bind(&candidate.doc_id)
    .bind(activity)
    .execute(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("Document cleanup activity reset failed", err))?;
    tx.commit()
      .await
      .map_err(|err| RuntimeError::database("Document cleanup activity reset commit failed", err))?;
    return Ok(Some((candidate, -2)));
  }
  let deleted_rows = delete_doc_rows(&mut tx, &candidate).await?;
  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("Document cleanup execute commit failed", err))?;
  Ok(Some((candidate, deleted_rows)))
}

fn payload_effect(effect: PendingEffect) -> RuntimeResult<RuntimeDocumentCleanupEffect> {
  let cleanup_version = effect
    .cleanup_payload
    .get("cleanupVersion")
    .and_then(Value::as_str)
    .ok_or_else(|| RuntimeError::invalid_state("Document cleanup effect payload has no cleanupVersion"))?;
  Ok(RuntimeDocumentCleanupEffect {
    workspace_id: effect.workspace_id,
    doc_id: effect.doc_id,
    cleanup_version: cleanup_version.to_string(),
    comment_objects_done: effect
      .cleanup_payload
      .get("commentObjectsDone")
      .and_then(Value::as_bool)
      .unwrap_or(false),
    search_done: effect
      .cleanup_payload
      .get("searchDone")
      .and_then(Value::as_bool)
      .unwrap_or(false),
    copilot_done: effect
      .cleanup_payload
      .get("copilotDone")
      .and_then(Value::as_bool)
      .unwrap_or(false),
  })
}

async fn complete_effect(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
  cleanup_version: &str,
  path: &str,
) -> RuntimeResult<bool> {
  let completed = sqlx::query_scalar::<_, bool>(
    r#"
    UPDATE document_cleanup_candidates
    SET cleanup_payload = jsonb_set(cleanup_payload, ARRAY[$4], 'true'),
        error = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = $1 AND doc_id = $2 AND status = 'effects_pending'
      AND cleanup_payload->>'cleanupVersion' = $3
    RETURNING COALESCE((cleanup_payload->>'commentObjectsDone')::boolean, false)
          AND COALESCE((cleanup_payload->>'searchDone')::boolean, false)
          AND COALESCE((cleanup_payload->>'copilotDone')::boolean, false)
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(cleanup_version)
  .bind(path)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup effect completion failed", err))?;
  let Some(completed) = completed else {
    return Ok(true);
  };
  if completed {
    sqlx::query(
      "DELETE FROM document_cleanup_candidates WHERE workspace_id = $1 AND doc_id = $2 AND \
       cleanup_payload->>'cleanupVersion' = $3",
    )
    .bind(workspace_id)
    .bind(doc_id)
    .bind(cleanup_version)
    .execute(&mut **tx)
    .await
    .map_err(|err| RuntimeError::database("Document cleanup completed candidate delete failed", err))?;
  }
  Ok(completed)
}

async fn process_comment_objects(runtime: &StorageRuntime, effect: &PendingEffect) -> RuntimeResult<()> {
  let cleanup_version = effect
    .cleanup_payload
    .get("cleanupVersion")
    .and_then(Value::as_str)
    .ok_or_else(|| RuntimeError::invalid_state("Document cleanup effect is missing cleanupVersion"))?;
  let comment_objects_done = effect
    .cleanup_payload
    .get("commentObjectsDone")
    .and_then(Value::as_bool)
    .unwrap_or(false);
  if !comment_objects_done {
    let keys = effect
      .cleanup_payload
      .get("commentAttachmentKeys")
      .and_then(Value::as_array)
      .into_iter()
      .flatten()
      .filter_map(Value::as_str)
      .map(|key| format!("comment-attachments/{}/{}/{key}", effect.workspace_id, effect.doc_id))
      .collect::<Vec<_>>();
    if !keys.is_empty() {
      let outcomes = runtime.object_storage_delete_many(keys).await?;
      if let Some(failed) = outcomes.iter().find(|outcome| outcome.error.is_some()) {
        return Err(RuntimeError::invalid_state(format!(
          "Comment attachment object delete failed for {}: {}",
          failed.key,
          failed.error.as_deref().unwrap_or("unknown")
        )));
      }
    }
  }
  let pool = runtime.pool().await?;
  let mut tx = pool
    .begin()
    .await
    .map_err(|err| RuntimeError::database("Document cleanup object effect transaction failed", err))?;
  complete_effect(
    &mut tx,
    &effect.workspace_id,
    &effect.doc_id,
    cleanup_version,
    "commentObjectsDone",
  )
  .await?;
  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("Document cleanup object effect commit failed", err))?;
  Ok(())
}

async fn load_pending_effects(
  pool: &PgPool,
  workspace_id: Option<&str>,
  limit: i64,
) -> RuntimeResult<Vec<PendingEffect>> {
  sqlx::query_as::<_, PendingEffect>(
    r#"
    SELECT workspace_id, doc_id, cleanup_payload
    FROM document_cleanup_candidates
    WHERE status = 'effects_pending' AND ($1::text IS NULL OR workspace_id = $1)
    ORDER BY updated_at, workspace_id, doc_id
    LIMIT $2
    "#,
  )
  .bind(workspace_id)
  .bind(limit)
  .fetch_all(pool)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup pending effects load failed", err))
}

#[napi_derive::napi]
impl StorageRuntime {
  #[napi]
  pub async fn reconcile_workspace_documents(
    &self,
    workspace_id: String,
  ) -> napi::Result<RuntimeDocumentCleanupReconcileResult> {
    Ok(reconcile_workspace(self, &workspace_id).await?)
  }

  #[napi]
  pub async fn execute_document_cleanup_candidates(
    &self,
    workspace_id: Option<String>,
    grace_period_days: i64,
    limit: i64,
  ) -> napi::Result<RuntimeDocumentCleanupExecuteResult> {
    if grace_period_days < 30 {
      return Err(napi_error("document cleanup grace period must be at least 30 days"));
    }
    if limit <= 0 {
      return Err(napi_error("document cleanup execute limit must be positive"));
    }
    let pool = self.pool().await?;
    let mut result = RuntimeDocumentCleanupExecuteResult {
      scanned_candidates: 0,
      serialization_retries: 0,
      executed: 0,
      recovered: 0,
      reset: 0,
      failed: 0,
      deleted_rows: 0,
      effects: Vec::new(),
    };
    for _ in 0..limit {
      let mut retries = 0;
      let outcome = loop {
        match execute_one(&pool, workspace_id.as_deref(), grace_period_days).await {
          Err(err) if err.is_serialization_failure() && retries < 3 => {
            retries += 1;
            result.serialization_retries += 1;
          }
          result => break result,
        }
      }?;
      let Some((_, outcome)) = outcome else { break };
      result.scanned_candidates += 1;
      match outcome {
        -1 => result.recovered += 1,
        -2 => result.reset += 1,
        -3 => result.failed += 1,
        rows => {
          result.executed += 1;
          result.deleted_rows += rows;
        }
      }
    }
    let effects = load_pending_effects(&pool, workspace_id.as_deref(), limit).await?;
    for effect in effects {
      if let Err(err) = process_comment_objects(self, &effect).await {
        result.failed += 1;
        sqlx::query(
          r#"
          UPDATE document_cleanup_candidates
          SET attempt_count = attempt_count + 1, error = $3, updated_at = CURRENT_TIMESTAMP
          WHERE workspace_id = $1 AND doc_id = $2
          "#,
        )
        .bind(&effect.workspace_id)
        .bind(&effect.doc_id)
        .bind(err.to_string())
        .execute(&pool)
        .await
        .map_err(|db_err| RuntimeError::database("Document cleanup effect failure write failed", db_err))?;
      }
    }
    result.effects = load_pending_effects(&pool, workspace_id.as_deref(), limit)
      .await?
      .into_iter()
      .map(payload_effect)
      .collect::<RuntimeResult<_>>()?;
    Ok(result)
  }

  #[napi]
  pub async fn ack_document_cleanup_effect(
    &self,
    workspace_id: String,
    doc_id: String,
    cleanup_version: String,
    effect: String,
  ) -> napi::Result<RuntimeDocumentCleanupAckResult> {
    let path = match effect.as_str() {
      "search" => "searchDone",
      "copilot" => "copilotDone",
      _ => return Err(napi_error("document cleanup effect must be search or copilot")),
    };
    let pool = self.pool().await?;
    let mut tx = pool
      .begin()
      .await
      .map_err(|err| RuntimeError::database("Document cleanup ack transaction failed", err))?;
    let current_version = sqlx::query_scalar::<_, String>(
      r#"
      SELECT cleanup_payload->>'cleanupVersion'
      FROM document_cleanup_candidates
      WHERE workspace_id = $1 AND doc_id = $2 AND status = 'effects_pending'
      "#,
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("Document cleanup ack candidate load failed", err))?;
    let Some(current_version) = current_version else {
      tx.rollback()
        .await
        .map_err(|err| RuntimeError::database("Document cleanup duplicate ack rollback failed", err))?;
      return Ok(RuntimeDocumentCleanupAckResult { completed: true });
    };
    if current_version != cleanup_version {
      return Err(napi_error("document cleanup effect candidate version mismatch"));
    }
    let completed = complete_effect(&mut tx, &workspace_id, &doc_id, &cleanup_version, path).await?;
    tx.commit()
      .await
      .map_err(|err| RuntimeError::database("Document cleanup ack commit failed", err))?;
    Ok(RuntimeDocumentCleanupAckResult { completed })
  }
}

#[cfg(test)]
mod tests {
  use std::sync::RwLock;

  use anyhow::{Context, Result as AnyResult};
  use napi::bindgen_prelude::Buffer;
  use sqlx::postgres::PgPoolOptions;
  use tokio::sync::Mutex;

  use super::*;
  use crate::runtime::{migrations::migrate_runtime_tables, storage_runtime::StorageRuntimeConfig};

  async fn runtime_from_database_url() -> AnyResult<Option<(StorageRuntime, PgPool)>> {
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return Ok(None);
    };
    let pool = PgPoolOptions::new()
      .max_connections(5)
      .connect(&database_url)
      .await
      .context("connect postgres for document cleanup tests")?;
    migrate_runtime_tables(&pool)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    let runtime = StorageRuntime {
      config: RwLock::new(StorageRuntimeConfig {
        database_url,
        backends: HashMap::new(),
      }),
      pool: Mutex::new(Some(pool.clone())),
    };
    Ok(Some((runtime, pool)))
  }

  async fn insert_user_workspace(pool: &PgPool, suffix: &str) -> AnyResult<(String, String)> {
    let user_id = format!("rust-test:document-cleanup:user:{suffix}");
    let workspace_id = format!("rust-test:document-cleanup:workspace:{suffix}");
    sqlx::query("DELETE FROM workspaces WHERE id = $1")
      .bind(&workspace_id)
      .execute(pool)
      .await?;
    sqlx::query("DELETE FROM users WHERE id = $1")
      .bind(&user_id)
      .execute(pool)
      .await?;
    sqlx::query(
      r#"
    INSERT INTO users (id, name, email, registered, email_verified, disabled, created_at)
    VALUES ($1, 'Rust Document Cleanup Actor', $2, true, CURRENT_TIMESTAMP, false, CURRENT_TIMESTAMP)
    "#,
    )
    .bind(&user_id)
    .bind(format!("{user_id}@example.com"))
    .execute(pool)
    .await?;
    sqlx::query("INSERT INTO workspaces (id, created_at) VALUES ($1, CURRENT_TIMESTAMP)")
      .bind(&workspace_id)
      .execute(pool)
      .await?;
    Ok((user_id, workspace_id))
  }

  async fn cleanup_workspace_fixture(pool: &PgPool, user_id: &str, workspace_id: &str) -> AnyResult<()> {
    sqlx::query("DELETE FROM storage_reconciliation_runs WHERE workspace_id = $1")
      .bind(workspace_id)
      .execute(pool)
      .await?;
    sqlx::query("DELETE FROM storage_reconciliation_checkpoints WHERE scope = $1")
      .bind(workspace_id)
      .execute(pool)
      .await?;
    for table in [
      "blob_cleanup_candidates",
      "document_cleanup_candidates",
      "doc_blob_refs",
    ] {
      sqlx::query(&format!("DELETE FROM {table} WHERE workspace_id = $1"))
        .bind(workspace_id)
        .execute(pool)
        .await?;
    }
    sqlx::query("DELETE FROM workspaces WHERE id = $1")
      .bind(workspace_id)
      .execute(pool)
      .await?;
    sqlx::query("DELETE FROM users WHERE id = $1")
      .bind(user_id)
      .execute(pool)
      .await?;
    Ok(())
  }

  #[tokio::test]
  async fn doc_blob_refs_projection_semantics_and_document_cleanup_mark_only_postgres() -> AnyResult<()> {
    let Some((runtime, pool)) = runtime_from_database_url().await? else {
      eprintln!("skipping postgres integration test: DATABASE_URL is not set");
      return Ok(());
    };
    let workspace_id = format!("rust-test:document-cleanup:{}", Uuid::new_v4());
    let doc_id = "missing-doc";
    let root = affine_doc_loader::add_doc_to_root_doc(Vec::new(), "live-doc", None)?;
    let live_doc = affine_doc_loader::build_full_doc("Live", "", "live-doc")?;
    let doc = affine_doc_loader::build_full_doc("Missing", "![Asset](blob://candidate-blob)", doc_id)?;
    sqlx::query(
      r#"
    INSERT INTO snapshots (workspace_id, guid, blob, updated_at)
    VALUES ($1, $1, $2, CURRENT_TIMESTAMP),
           ($1, 'live-doc', $3, CURRENT_TIMESTAMP),
           ($1, $4, $5, CURRENT_TIMESTAMP - INTERVAL '90 days')
    "#,
    )
    .bind(&workspace_id)
    .bind(root)
    .bind(live_doc)
    .bind(doc_id)
    .bind(doc)
    .execute(&pool)
    .await?;

    let observed_after = Utc::now();
    let first = reconcile_workspace(&runtime, &workspace_id).await?;
    assert_eq!(
      (first.scanned_docs, first.marked, first.reset, first.recovered),
      (2, 1, 0, 0)
    );
    let first_missing_since = sqlx::query_scalar::<_, DateTime<Utc>>(
      "SELECT missing_since FROM document_cleanup_candidates WHERE workspace_id = $1 AND doc_id = $2",
    )
    .bind(&workspace_id)
    .bind(doc_id)
    .fetch_one(&pool)
    .await?;
    assert!(first_missing_since >= observed_after);

    let projection = runtime
      .rebuild_workspace_doc_blob_refs(workspace_id.clone(), 100)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!(projection.failed_docs, 0);
    assert_eq!(
      sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM doc_blob_refs WHERE workspace_id = $1 AND doc_id = $2 AND blob_key = 'candidate-blob'",
      )
      .bind(&workspace_id)
      .bind(doc_id)
      .fetch_one(&pool)
      .await?,
      1
    );

    sqlx::query("UPDATE snapshots SET blob = $2 WHERE workspace_id = $1 AND guid = 'live-doc'")
      .bind(&workspace_id)
      .bind(vec![0xff_u8])
      .execute(&pool)
      .await?;
    let partial = runtime
      .rebuild_workspace_doc_blob_refs(workspace_id.clone(), 1)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!(
      (partial.failed_docs, partial.next_cursor.as_deref()),
      (1, Some("live-doc"))
    );
    let partial_checkpoint = sqlx::query(
      "SELECT status, metadata FROM storage_reconciliation_checkpoints WHERE kind = 'doc_blob_refs' AND scope = $1",
    )
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(partial_checkpoint.get::<String, _>("status"), "running");
    assert_eq!(partial_checkpoint.get::<Value, _>("metadata")["failedDocs"], 1);

    sqlx::query(
      "UPDATE storage_reconciliation_checkpoints SET status = 'failed', metadata = '{\"parserVersion\":1}' WHERE kind \
       = 'doc_blob_refs' AND scope = $1",
    )
    .bind(&workspace_id)
    .execute(&pool)
    .await?;
    let resumed = runtime
      .rebuild_workspace_doc_blob_refs(workspace_id.clone(), 1)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!((resumed.failed_docs, resumed.next_cursor), (0, None));
    let resumed_checkpoint = sqlx::query(
      "SELECT status, metadata FROM storage_reconciliation_checkpoints WHERE kind = 'doc_blob_refs' AND scope = $1",
    )
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(resumed_checkpoint.get::<String, _>("status"), "failed");
    assert_eq!(resumed_checkpoint.get::<Value, _>("metadata")["failedDocs"], 1);

    sqlx::query("UPDATE snapshots SET blob = $2 WHERE workspace_id = $1 AND guid = 'live-doc'")
      .bind(&workspace_id)
      .bind(affine_doc_loader::build_full_doc("Live", "", "live-doc")?)
      .execute(&pool)
      .await?;
    let recovered_projection = runtime
      .rebuild_workspace_doc_blob_refs(workspace_id.clone(), 100)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!(recovered_projection.failed_docs, 0);
    assert_eq!(
      sqlx::query_scalar::<_, String>(
        "SELECT status FROM storage_reconciliation_checkpoints WHERE kind = 'doc_blob_refs' AND scope = $1",
      )
      .bind(&workspace_id)
      .fetch_one(&pool)
      .await?,
      "completed"
    );

    sqlx::query(
      "UPDATE storage_reconciliation_checkpoints SET status = 'failed', cursor = '{\"lastDocId\":\"live-doc\"}', \
       metadata = '{\"parserVersion\":0,\"failedDocs\":99}' WHERE kind = 'doc_blob_refs' AND scope = $1",
    )
    .bind(&workspace_id)
    .execute(&pool)
    .await?;
    let parser_upgrade = runtime
      .rebuild_workspace_doc_blob_refs(workspace_id.clone(), 100)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!((parser_upgrade.scanned_docs, parser_upgrade.failed_docs), (2, 0));
    assert_eq!(
      sqlx::query_scalar::<_, String>(
        "SELECT status FROM storage_reconciliation_checkpoints WHERE kind = 'doc_blob_refs' AND scope = $1",
      )
      .bind(&workspace_id)
      .fetch_one(&pool)
      .await?,
      "completed"
    );

    let second = reconcile_workspace(&runtime, &workspace_id).await?;
    assert_eq!((second.marked, second.reset, second.recovered), (0, 0, 0));
    let unchanged_missing_since = sqlx::query_scalar::<_, DateTime<Utc>>(
      "SELECT missing_since FROM document_cleanup_candidates WHERE workspace_id = $1 AND doc_id = $2",
    )
    .bind(&workspace_id)
    .bind(doc_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(unchanged_missing_since, first_missing_since);

    sqlx::query("UPDATE snapshots SET updated_at = CURRENT_TIMESTAMP WHERE workspace_id = $1 AND guid = $2")
      .bind(&workspace_id)
      .bind(doc_id)
      .execute(&pool)
      .await?;
    let reset = reconcile_workspace(&runtime, &workspace_id).await?;
    assert_eq!(reset.reset, 1);
    let reset_missing_since = sqlx::query_scalar::<_, DateTime<Utc>>(
      "SELECT missing_since FROM document_cleanup_candidates WHERE workspace_id = $1 AND doc_id = $2",
    )
    .bind(&workspace_id)
    .bind(doc_id)
    .fetch_one(&pool)
    .await?;
    assert!(reset_missing_since >= first_missing_since);

    sqlx::query("UPDATE snapshots SET blob = $2 WHERE workspace_id = $1 AND guid = $1")
      .bind(&workspace_id)
      .bind(affine_doc_loader::add_doc_to_root_doc(Vec::new(), doc_id, None)?)
      .execute(&pool)
      .await?;
    let recovered = reconcile_workspace(&runtime, &workspace_id).await?;
    assert_eq!(recovered.recovered, 1);

    sqlx::query("UPDATE snapshots SET blob = $2 WHERE workspace_id = $1 AND guid = $1")
      .bind(&workspace_id)
      .bind(vec![0xff_u8])
      .execute(&pool)
      .await?;
    assert!(reconcile_workspace(&runtime, &workspace_id).await.is_err());
    let failure = sqlx::query(
      "SELECT status, metadata FROM storage_reconciliation_checkpoints WHERE kind = 'document_cleanup' AND scope = $1",
    )
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(failure.get::<String, _>("status"), "failed");
    assert_eq!(failure.get::<Value, _>("metadata")["rootFailed"], 1);

    sqlx::query("DELETE FROM storage_reconciliation_runs WHERE workspace_id = $1")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    sqlx::query("DELETE FROM storage_reconciliation_checkpoints WHERE scope = $1")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    sqlx::query("DELETE FROM doc_blob_refs WHERE workspace_id = $1")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    sqlx::query("DELETE FROM document_cleanup_candidates WHERE workspace_id = $1")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    sqlx::query("DELETE FROM snapshots WHERE workspace_id = $1")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    Ok(())
  }

  #[tokio::test]
  async fn document_cleanup_execute_postgres_semantics() -> AnyResult<()> {
    let Some((runtime, pool)) = runtime_from_database_url().await? else {
      eprintln!("skipping postgres integration test: DATABASE_URL is not set");
      return Ok(());
    };
    let suffix = Uuid::new_v4().to_string();
    let (user_id, workspace_id) = insert_user_workspace(&pool, &suffix).await?;
    let object_root = tempfile::tempdir()?;
    runtime.config.write().unwrap().backends.insert(
      "blob".to_string(),
      super::super::StorageBackendConfig::Fs(super::super::FsStorageConfig {
        provider: "fs".to_string(),
        root: object_root.path().to_string_lossy().to_string(),
        bucket: "document-cleanup-test".to_string(),
      }),
    );
    let doc_id = "missing-doc";
    let live_doc_id = "live-doc";
    let root = affine_doc_loader::add_doc_to_root_doc(Vec::new(), live_doc_id, None)?;
    let live_doc = affine_doc_loader::build_full_doc("Live", "", live_doc_id)?;
    let missing_doc = affine_doc_loader::build_full_doc("Doc", "![Alt](blob://image-blob-key)", doc_id)?;
    sqlx::query(
      r#"
    INSERT INTO snapshots (workspace_id, guid, blob, updated_at)
    VALUES ($1, $1, $2, CURRENT_TIMESTAMP),
           ($1, $3, $4, CURRENT_TIMESTAMP),
           ($1, $5, $6, CURRENT_TIMESTAMP - INTERVAL '90 days')
    "#,
    )
    .bind(&workspace_id)
    .bind(root)
    .bind(live_doc_id)
    .bind(live_doc)
    .bind(doc_id)
    .bind(missing_doc)
    .execute(&pool)
    .await?;
    sqlx::query(
      "INSERT INTO updates (workspace_id, guid, blob, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP - INTERVAL \
       '89 days')",
    )
    .bind(&workspace_id)
    .bind(doc_id)
    .bind(affine_doc_loader::add_doc_to_root_doc(
      Vec::new(),
      "update-block",
      None,
    )?)
    .execute(&pool)
    .await?;
    sqlx::query(
      r#"
    INSERT INTO snapshot_histories (workspace_id, guid, timestamp, blob, expired_at)
    VALUES ($1, $2, CURRENT_TIMESTAMP - INTERVAL '88 days', $3, CURRENT_TIMESTAMP + INTERVAL '1 day')
    "#,
    )
    .bind(&workspace_id)
    .bind(doc_id)
    .bind(affine_doc_loader::add_doc_to_root_doc(
      Vec::new(),
      "history-block",
      None,
    )?)
    .execute(&pool)
    .await?;

    let mark = reconcile_workspace(&runtime, &workspace_id).await?;
    assert_eq!(mark.marked, 1);
    sqlx::query(
      "UPDATE document_cleanup_candidates SET missing_since = CURRENT_TIMESTAMP - INTERVAL '29 days' WHERE \
       workspace_id = $1 AND doc_id = $2",
    )
    .bind(&workspace_id)
    .bind(doc_id)
    .execute(&pool)
    .await?;
    let refs = runtime
      .rebuild_workspace_doc_blob_refs(workspace_id.clone(), 100)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!(refs.failed_docs, 0);
    let ref_count = sqlx::query_scalar::<_, i64>(
      "SELECT COUNT(*) FROM doc_blob_refs WHERE workspace_id = $1 AND doc_id = $2 AND blob_key = 'image-blob-key'",
    )
    .bind(&workspace_id)
    .bind(doc_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(ref_count, 1);
    let not_due = execute_one(&pool, Some(&workspace_id), 30).await?;
    assert!(not_due.is_none());

    let session_id = format!("session:{suffix}");
    let prompt_name = format!("p_{}", &suffix[..30]);
    sqlx::query(
      "INSERT INTO ai_prompts_metadata (name, model, created_at, updated_at) VALUES ($1, 'test-model', \
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT (name) DO NOTHING",
    )
    .bind(&prompt_name)
    .execute(&pool)
    .await?;
    sqlx::query(
      r#"
    INSERT INTO ai_sessions_metadata
      (id, user_id, workspace_id, doc_id, prompt_name, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    "#,
    )
    .bind(&session_id)
    .bind(&user_id)
    .bind(&workspace_id)
    .bind(doc_id)
    .bind(&prompt_name)
    .execute(&pool)
    .await?;
    sqlx::query(
      r#"
    INSERT INTO ai_action_runs
      (id, user_id, workspace_id, doc_id, session_id, action_id, action_version, status, updated_at)
    VALUES ($1, $2, $3, $4, $5, 'action', '1', 'running', CURRENT_TIMESTAMP)
    "#,
    )
    .bind(format!("action:{suffix}"))
    .bind(&user_id)
    .bind(&workspace_id)
    .bind(doc_id)
    .bind(&session_id)
    .execute(&pool)
    .await?;
    sqlx::query(
      "INSERT INTO workspace_member_last_access (workspace_id, user_id, last_accessed_at, last_doc_id) VALUES ($1, \
       $2, CURRENT_TIMESTAMP, $3)",
    )
    .bind(&workspace_id)
    .bind(&user_id)
    .bind(doc_id)
    .execute(&pool)
    .await?;
    sqlx::query("INSERT INTO workspace_pages (workspace_id, page_id) VALUES ($1, $2)")
      .bind(&workspace_id)
      .bind(doc_id)
      .execute(&pool)
      .await?;
    sqlx::query("INSERT INTO doc_access_policies (workspace_id, doc_id) VALUES ($1, $2)")
      .bind(&workspace_id)
      .bind(doc_id)
      .execute(&pool)
      .await?;
    sqlx::query(
      "INSERT INTO doc_grants (workspace_id, doc_id, principal_type, principal_id, role) VALUES ($1, $2, 'user', $3, \
       'owner')",
    )
    .bind(&workspace_id)
    .bind(doc_id)
    .bind(&user_id)
    .execute(&pool)
    .await?;
    sqlx::query("INSERT INTO ai_workspace_ignored_docs (workspace_id, doc_id) VALUES ($1, $2)")
      .bind(&workspace_id)
      .bind(doc_id)
      .execute(&pool)
      .await?;
    sqlx::query("INSERT INTO workspace_doc_view_daily (workspace_id, doc_id, date) VALUES ($1, $2, CURRENT_DATE)")
      .bind(&workspace_id)
      .bind(doc_id)
      .execute(&pool)
      .await?;
    let comment_id = format!("comment:{suffix}");
    sqlx::query("INSERT INTO comments (id, workspace_id, doc_id, user_id, content) VALUES ($1, $2, $3, $4, '{}')")
      .bind(&comment_id)
      .bind(&workspace_id)
      .bind(doc_id)
      .bind(&user_id)
      .execute(&pool)
      .await?;
    sqlx::query(
      "INSERT INTO replies (id, user_id, comment_id, workspace_id, doc_id, content) VALUES ($1, $2, $3, $4, $5, '{}')",
    )
    .bind(format!("reply:{suffix}"))
    .bind(&user_id)
    .bind(&comment_id)
    .bind(&workspace_id)
    .bind(doc_id)
    .execute(&pool)
    .await?;
    let attachment_key = "attachment-key";
    sqlx::query(
      "INSERT INTO comment_attachments (workspace_id, doc_id, key, size, mime, name, created_by) VALUES ($1, $2, $3, \
       4, 'text/plain', 'attachment.txt', $4)",
    )
    .bind(&workspace_id)
    .bind(doc_id)
    .bind(attachment_key)
    .bind(&user_id)
    .execute(&pool)
    .await?;
    let attachment_object_key = format!("comment-attachments/{workspace_id}/{doc_id}/{attachment_key}");
    runtime
      .put_object(
        "blob".to_string(),
        attachment_object_key.clone(),
        Buffer::from(b"test".to_vec()),
        None,
      )
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    sqlx::query(
      r#"
    INSERT INTO ai_workspace_embeddings
      (workspace_id, doc_id, chunk, content, embedding, created_at, updated_at)
    VALUES ($1, $2, 0, 'content', ('[' || rtrim(repeat('0,', 1024), ',') || ']')::vector,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    "#,
    )
    .bind(&workspace_id)
    .bind(doc_id)
    .execute(&pool)
    .await?;

    sqlx::query(
      "UPDATE document_cleanup_candidates SET missing_since = CURRENT_TIMESTAMP - INTERVAL '31 days' WHERE \
       workspace_id = $1 AND doc_id = $2",
    )
    .bind(&workspace_id)
    .bind(doc_id)
    .execute(&pool)
    .await?;
    let executed = runtime
      .execute_document_cleanup_candidates(Some(workspace_id.clone()), 30, 10)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!(executed.executed, 1);
    assert_eq!(executed.failed, 0);
    assert_eq!(executed.effects.len(), 1);
    assert!(executed.effects[0].comment_objects_done);
    assert!(!executed.effects[0].search_done);
    assert!(!executed.effects[0].copilot_done);
    assert!(
      runtime
        .head_object("blob".to_string(), attachment_object_key)
        .await
        .map_err(|err| anyhow::anyhow!(err.to_string()))?
        .is_none()
    );

    for (table, column) in [
      ("snapshots", "guid"),
      ("updates", "guid"),
      ("snapshot_histories", "guid"),
      ("workspace_pages", "page_id"),
      ("doc_access_policies", "doc_id"),
      ("doc_grants", "doc_id"),
      ("doc_blob_refs", "doc_id"),
      ("ai_workspace_ignored_docs", "doc_id"),
      ("comments", "doc_id"),
      ("comment_attachments", "doc_id"),
      ("replies", "doc_id"),
      ("workspace_doc_view_daily", "doc_id"),
      ("ai_workspace_embeddings", "doc_id"),
    ] {
      let count = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(*) FROM {table} WHERE workspace_id = $1 AND {column} = $2"
      ))
      .bind(&workspace_id)
      .bind(doc_id)
      .fetch_one(&pool)
      .await?;
      assert_eq!(count, 0, "{table} should be cleaned");
    }
    for (table, column) in [
      ("workspace_member_last_access", "last_doc_id"),
      ("ai_sessions_metadata", "doc_id"),
      ("ai_action_runs", "doc_id"),
    ] {
      let count = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(*) FROM {table} WHERE workspace_id = $1 AND {column} = $2"
      ))
      .bind(&workspace_id)
      .bind(doc_id)
      .fetch_one(&pool)
      .await?;
      assert_eq!(count, 0, "{table}.{column} should be nulled");
    }

    let effect = &executed.effects[0];
    let search = runtime
      .ack_document_cleanup_effect(
        workspace_id.clone(),
        doc_id.to_string(),
        effect.cleanup_version.clone(),
        "search".to_string(),
      )
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert!(!search.completed);
    let copilot = runtime
      .ack_document_cleanup_effect(
        workspace_id.clone(),
        doc_id.to_string(),
        effect.cleanup_version.clone(),
        "copilot".to_string(),
      )
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert!(copilot.completed);
    let candidate_count = sqlx::query_scalar::<_, i64>(
      "SELECT COUNT(*) FROM document_cleanup_candidates WHERE workspace_id = $1 AND doc_id = $2",
    )
    .bind(&workspace_id)
    .bind(doc_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(candidate_count, 0);

    let retry_doc_id = "object-retry-doc";
    let retry_doc = affine_doc_loader::build_full_doc("Retry", "", retry_doc_id)?;
    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP - INTERVAL \
       '90 days')",
    )
    .bind(&workspace_id)
    .bind(retry_doc_id)
    .bind(retry_doc)
    .execute(&pool)
    .await?;
    sqlx::query(
      "INSERT INTO comment_attachments (workspace_id, doc_id, key, size, mime, name, created_by) VALUES ($1, $2, \
       '..', 4, 'text/plain', 'attachment.txt', $3)",
    )
    .bind(&workspace_id)
    .bind(retry_doc_id)
    .bind(&user_id)
    .execute(&pool)
    .await?;
    assert_eq!(reconcile_workspace(&runtime, &workspace_id).await?.marked, 1);
    sqlx::query(
      "UPDATE document_cleanup_candidates SET missing_since = CURRENT_TIMESTAMP - INTERVAL '31 days' WHERE \
       workspace_id = $1 AND doc_id = $2",
    )
    .bind(&workspace_id)
    .bind(retry_doc_id)
    .execute(&pool)
    .await?;

    let failed_object_delete = runtime
      .execute_document_cleanup_candidates(Some(workspace_id.clone()), 30, 10)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!(failed_object_delete.executed, 1);
    assert_eq!(failed_object_delete.failed, 1);
    assert!(!failed_object_delete.effects[0].comment_objects_done);
    let retained = sqlx::query(
      "SELECT status, attempt_count, error, cleanup_payload->>'cleanupVersion' AS cleanup_version FROM \
       document_cleanup_candidates WHERE workspace_id = $1 AND doc_id = $2",
    )
    .bind(&workspace_id)
    .bind(retry_doc_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(retained.get::<String, _>("status"), "effects_pending");
    assert_eq!(retained.get::<i32, _>("attempt_count"), 1);
    assert!(retained.get::<Option<String>, _>("error").is_some());
    let retry_cleanup_version = retained.get::<String, _>("cleanup_version");

    for effect in ["search", "copilot"] {
      let ack = runtime
        .ack_document_cleanup_effect(
          workspace_id.clone(),
          retry_doc_id.to_string(),
          retry_cleanup_version.clone(),
          effect.to_string(),
        )
        .await
        .map_err(|err| anyhow::anyhow!(err.to_string()))?;
      assert!(!ack.completed);
    }

    sqlx::query(
      "UPDATE document_cleanup_candidates SET cleanup_payload = jsonb_set(cleanup_payload, '{commentAttachmentKeys}', \
       '[\"already-missing\"]') WHERE workspace_id = $1 AND doc_id = $2",
    )
    .bind(&workspace_id)
    .bind(retry_doc_id)
    .execute(&pool)
    .await?;
    let retried = runtime
      .execute_document_cleanup_candidates(Some(workspace_id.clone()), 30, 10)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!(retried.executed, 0);
    assert_eq!(retried.failed, 0);
    assert!(retried.effects.is_empty());
    let retry_candidate_count = sqlx::query_scalar::<_, i64>(
      "SELECT COUNT(*) FROM document_cleanup_candidates WHERE workspace_id = $1 AND doc_id = $2",
    )
    .bind(&workspace_id)
    .bind(retry_doc_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(retry_candidate_count, 0);

    cleanup_workspace_fixture(&pool, &user_id, &workspace_id).await?;
    Ok(())
  }
}
