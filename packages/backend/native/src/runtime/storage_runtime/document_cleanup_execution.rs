use affine_core::access_control::classify_reserved_document;
use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, Transaction};

use super::{CurrentDoc, CurrentDocUpdate, DocumentCleanupCandidate, RuntimeError, RuntimeResult, merge_current_doc};

#[derive(Debug, PartialEq, Eq)]
pub(super) enum DocumentCleanupOutcome {
  Deleted(i64),
  Recovered,
  Reset,
  Failed,
  Busy,
}

async fn load_current_doc_for_update(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<Option<CurrentDoc>> {
  let snapshot =
    sqlx::query_as::<_, CurrentDoc>("SELECT blob, updated_at FROM snapshots WHERE workspace_id = $1 AND guid = $2")
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
  merge_current_doc(snapshot, updates)
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

async fn delete_doc_rows(
  tx: &mut Transaction<'_, Postgres>,
  candidate: &DocumentCleanupCandidate,
) -> RuntimeResult<i64> {
  let mut deleted_rows = 0;
  for (table, doc_column) in [
    ("workspace_pages", "page_id"),
    ("doc_access_policies", "doc_id"),
    ("doc_grants", "doc_id"),
    ("doc_blob_refs", "doc_id"),
    ("doc_blob_ref_projections", "doc_id"),
    ("ai_workspace_ignored_docs", "doc_id"),
    ("comments", "doc_id"),
    ("comment_attachments", "doc_id"),
    ("workspace_doc_view_daily", "doc_id"),
  ] {
    let query = format!("DELETE FROM {table} WHERE workspace_id = $1 AND {doc_column} = $2");
    deleted_rows += sqlx::query(&query)
      .bind(&candidate.workspace_id)
      .bind(&candidate.doc_id)
      .execute(&mut **tx)
      .await
      .map_err(|err| RuntimeError::database(format!("Document cleanup {table} delete failed"), err))?
      .rows_affected() as i64;
  }
  for (table, doc_column) in [
    ("workspace_member_last_access", "last_doc_id"),
    ("ai_sessions_metadata", "doc_id"),
    ("ai_action_runs", "doc_id"),
  ] {
    let query = format!("UPDATE {table} SET {doc_column} = NULL WHERE workspace_id = $1 AND {doc_column} = $2");
    deleted_rows += sqlx::query(&query)
      .bind(&candidate.workspace_id)
      .bind(&candidate.doc_id)
      .execute(&mut **tx)
      .await
      .map_err(|err| RuntimeError::database(format!("Document cleanup {table} unlink failed"), err))?
      .rows_affected() as i64;
  }
  for table in ["updates", "snapshot_histories", "snapshots"] {
    deleted_rows += sqlx::query(&format!("DELETE FROM {table} WHERE workspace_id = $1 AND guid = $2"))
      .bind(&candidate.workspace_id)
      .bind(&candidate.doc_id)
      .execute(&mut **tx)
      .await
      .map_err(|err| RuntimeError::database(format!("Document cleanup {table} delete failed"), err))?
      .rows_affected() as i64;
  }
  sqlx::query("DELETE FROM document_cleanup_candidates WHERE workspace_id = $1 AND doc_id = $2")
    .bind(&candidate.workspace_id)
    .bind(&candidate.doc_id)
    .execute(&mut **tx)
    .await
    .map_err(|err| RuntimeError::database("Document cleanup candidate delete failed", err))?;
  Ok(deleted_rows)
}

async fn mark_candidate_failed(
  tx: &mut Transaction<'_, Postgres>,
  candidate: &DocumentCleanupCandidate,
  error: String,
) -> RuntimeResult<()> {
  sqlx::query(
    "UPDATE document_cleanup_candidates SET status = 'failed', attempt_count = attempt_count + 1, error = $3, \
     updated_at = CURRENT_TIMESTAMP WHERE workspace_id = $1 AND doc_id = $2",
  )
  .bind(&candidate.workspace_id)
  .bind(&candidate.doc_id)
  .bind(&error)
  .execute(&mut **tx)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup candidate failure write failed", err))?;
  Ok(())
}

pub(super) async fn execute_document_cleanup_candidate(
  pool: &PgPool,
  workspace_id: Option<&str>,
  grace_period_days: i64,
  busy_workspaces: &[String],
) -> RuntimeResult<Option<(DocumentCleanupCandidate, DocumentCleanupOutcome)>> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|err| RuntimeError::database("Document cleanup execute transaction failed", err))?;
  sqlx::query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
    .execute(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("Document cleanup isolation setup failed", err))?;
  let candidate = sqlx::query_as::<_, DocumentCleanupCandidate>(
    r#"
    SELECT workspace_id, doc_id, last_doc_activity_at
    FROM document_cleanup_candidates
    WHERE (status = 'marked'
        OR (status = 'failed' AND updated_at <= CURRENT_TIMESTAMP - INTERVAL '5 minutes'))
      AND ($1::text IS NULL OR workspace_id = $1)
      AND missing_since <= CURRENT_TIMESTAMP - make_interval(days => $2::int)
      AND NOT (workspace_id = ANY($3))
    ORDER BY missing_since, workspace_id, doc_id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
    "#,
  )
  .bind(workspace_id)
  .bind(grace_period_days as i32)
  .bind(busy_workspaces)
  .fetch_optional(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("Document cleanup candidate claim failed", err))?;
  let Some(candidate) = candidate else {
    tx.rollback()
      .await
      .map_err(|err| RuntimeError::database("Document cleanup empty claim rollback failed", err))?;
    return Ok(None);
  };
  let workspace_lock_key = format!("storage-workspace:{}", candidate.workspace_id);
  let locked: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0))")
    .bind(&workspace_lock_key)
    .fetch_one(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("Document cleanup workspace source lock failed", err))?;
  if !locked {
    tx.rollback()
      .await
      .map_err(|err| RuntimeError::database("Document cleanup busy claim rollback failed", err))?;
    return Ok(Some((candidate, DocumentCleanupOutcome::Busy)));
  }

  if classify_reserved_document(&candidate.workspace_id, &candidate.doc_id).is_valid_reserved() {
    sqlx::query("DELETE FROM document_cleanup_candidates WHERE workspace_id = $1 AND doc_id = $2")
      .bind(&candidate.workspace_id)
      .bind(&candidate.doc_id)
      .execute(&mut *tx)
      .await
      .map_err(|err| RuntimeError::database("Document cleanup reserved candidate delete failed", err))?;
    tx.commit()
      .await
      .map_err(|err| RuntimeError::database("Document cleanup reserved candidate commit failed", err))?;
    return Ok(Some((candidate, DocumentCleanupOutcome::Recovered)));
  }

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
      return Ok(Some((candidate, DocumentCleanupOutcome::Failed)));
    }
    Err(err) => {
      mark_candidate_failed(&mut tx, &candidate, err.to_string()).await?;
      tx.commit()
        .await
        .map_err(|err| RuntimeError::database("Document cleanup failed candidate commit failed", err))?;
      return Ok(Some((candidate, DocumentCleanupOutcome::Failed)));
    }
  };
  let contains = match root_contains(root, &candidate.doc_id) {
    Ok(contains) => contains,
    Err(err) => {
      mark_candidate_failed(&mut tx, &candidate, err.to_string()).await?;
      tx.commit()
        .await
        .map_err(|err| RuntimeError::database("Document cleanup failed candidate commit failed", err))?;
      return Ok(Some((candidate, DocumentCleanupOutcome::Failed)));
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
    return Ok(Some((candidate, DocumentCleanupOutcome::Recovered)));
  }
  let activity = current_activity(&mut tx, &candidate.workspace_id, &candidate.doc_id).await?;
  if activity != candidate.last_doc_activity_at {
    sqlx::query(
      "UPDATE document_cleanup_candidates SET status = 'marked', missing_since = CURRENT_TIMESTAMP, \
       last_observed_missing_at = CURRENT_TIMESTAMP, last_doc_activity_at = $3, error = NULL, updated_at = \
       CURRENT_TIMESTAMP WHERE workspace_id = $1 AND doc_id = $2",
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
    return Ok(Some((candidate, DocumentCleanupOutcome::Reset)));
  }
  let deleted_rows = delete_doc_rows(&mut tx, &candidate).await?;
  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("Document cleanup execute commit failed", err))?;
  Ok(Some((candidate, DocumentCleanupOutcome::Deleted(deleted_rows))))
}
