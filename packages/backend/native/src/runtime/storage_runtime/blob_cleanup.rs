use std::collections::HashMap;

use chrono::{DateTime, Duration, Utc};
use sqlx::{FromRow, PgPool};

use super::{
  RuntimeBlobCleanupExecuteResult, RuntimeBlobCleanupPlanResult, RuntimeError, RuntimeResult, StorageRuntime,
  napi_error,
};

#[derive(FromRow)]
struct BlobCandidateRow {
  workspace_id: String,
  key: String,
  size: i32,
}

#[derive(FromRow)]
struct MarkedCandidateRow {
  workspace_id: String,
  blob_key: String,
}

struct DeletableCandidate {
  workspace_id: String,
  blob_key: String,
  object_key: String,
}

fn push_workspace_once(workspace_ids: &mut Vec<String>, workspace_id: &str) {
  if !workspace_ids.iter().any(|id| id == workspace_id) {
    workspace_ids.push(workspace_id.to_string());
  }
}

async fn checkpoint_completed(pool: &PgPool, kind: &str, scope: &str) -> RuntimeResult<bool> {
  sqlx::query_scalar::<_, bool>(
    "SELECT EXISTS(SELECT 1 FROM blob_reconciliation_checkpoints WHERE kind = $1 AND scope = $2 AND status = \
     'completed')",
  )
  .bind(kind)
  .bind(scope)
  .fetch_one(pool)
  .await
  .map_err(|err| RuntimeError::database("Blob cleanup checkpoint check failed", err))
}

async fn projection_is_stale(pool: &PgPool, workspace_id: &str) -> RuntimeResult<bool> {
  let checkpoint_fresh = checkpoint_completed(pool, "doc_blob_refs", workspace_id).await?;
  let has_stale_rows = sqlx::query_scalar::<_, bool>(
    "SELECT EXISTS(SELECT 1 FROM doc_blob_refs WHERE workspace_id = $1 AND status <> 'fresh')",
  )
  .bind(workspace_id)
  .fetch_one(pool)
  .await
  .map_err(|err| RuntimeError::database("Blob cleanup projection freshness check failed", err))?;
  Ok(!checkpoint_fresh || has_stale_rows)
}

async fn stale_projection_workspaces(pool: &PgPool, workspace_id: &str) -> RuntimeResult<Vec<String>> {
  if projection_is_stale(pool, workspace_id).await? {
    Ok(vec![workspace_id.to_string()])
  } else {
    Ok(Vec::new())
  }
}

async fn metadata_backfill_is_complete(pool: &PgPool, workspace_id: &str) -> RuntimeResult<bool> {
  checkpoint_completed(pool, "blob_metadata_backfill", workspace_id).await
}

async fn has_doc_ref(pool: &PgPool, workspace_id: &str, key: &str) -> RuntimeResult<bool> {
  sqlx::query_scalar::<_, bool>(
    "SELECT EXISTS(SELECT 1 FROM doc_blob_refs WHERE workspace_id = $1 AND blob_key = $2 AND status = 'fresh')",
  )
  .bind(workspace_id)
  .bind(key)
  .fetch_one(pool)
  .await
  .map_err(|err| RuntimeError::database("Blob cleanup doc ref check failed", err))
}

async fn has_other_ref(pool: &PgPool, workspace_id: &str, key: &str) -> RuntimeResult<bool> {
  let required_ref = sqlx::query_scalar::<_, bool>(
    r#"
    SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1 AND avatar_key = $2)
      OR EXISTS(SELECT 1 FROM ai_transcript_tasks WHERE workspace_id = $1 AND blob_id = $2)
      OR EXISTS(SELECT 1 FROM ai_jobs WHERE workspace_id = $1 AND blob_id = $2)
      OR EXISTS(
        SELECT 1
        FROM ai_contexts c
        JOIN ai_sessions_metadata s ON s.id = c.session_id
        WHERE s.workspace_id = $1
          AND jsonb_path_exists(
            c.config::jsonb,
            '$.** ? (@ == $blobKey)',
            jsonb_build_object('blobKey', to_jsonb($2::text))
          )
      )
    "#,
  )
  .bind(workspace_id)
  .bind(key)
  .fetch_one(pool)
  .await
  .map_err(|err| RuntimeError::database("Blob cleanup protected ref check failed", err))?;
  if required_ref {
    return Ok(true);
  }
  if table_exists(pool, "ai_workspace_files").await?
    && sqlx::query_scalar::<_, bool>(
      "SELECT EXISTS(SELECT 1 FROM ai_workspace_files WHERE workspace_id = $1 AND blob_id = $2)",
    )
    .bind(workspace_id)
    .bind(key)
    .fetch_one(pool)
    .await
    .map_err(|err| RuntimeError::database("Blob cleanup workspace file ref check failed", err))?
  {
    return Ok(true);
  }
  if table_exists(pool, "ai_workspace_blob_embeddings").await?
    && sqlx::query_scalar::<_, bool>(
      "SELECT EXISTS(SELECT 1 FROM ai_workspace_blob_embeddings WHERE workspace_id = $1 AND blob_id = $2)",
    )
    .bind(workspace_id)
    .bind(key)
    .fetch_one(pool)
    .await
    .map_err(|err| RuntimeError::database("Blob cleanup workspace blob embedding ref check failed", err))?
  {
    return Ok(true);
  }
  Ok(false)
}

async fn table_exists(pool: &PgPool, table: &str) -> RuntimeResult<bool> {
  sqlx::query_scalar::<_, bool>("SELECT to_regclass($1) IS NOT NULL")
    .bind(format!("public.{table}"))
    .fetch_one(pool)
    .await
    .map_err(|err| RuntimeError::database("Blob cleanup table existence check failed", err))
}

async fn load_completed_blobs(
  pool: &PgPool,
  workspace_id: &str,
  after_key: Option<&str>,
  limit: i64,
) -> RuntimeResult<Vec<BlobCandidateRow>> {
  sqlx::query_as::<_, BlobCandidateRow>(
    r#"
    SELECT workspace_id, key, size
    FROM blobs
    WHERE workspace_id = $1
      AND status = 'completed'
      AND deleted_at IS NULL
      AND ($2::text IS NULL OR key > $2)
    ORDER BY key ASC
    LIMIT $3
    "#,
  )
  .bind(workspace_id)
  .bind(after_key)
  .bind(limit)
  .fetch_all(pool)
  .await
  .map_err(|err| RuntimeError::database("Blob cleanup load completed blobs failed", err))
}

async fn load_plan_cursor(pool: &PgPool, workspace_id: &str) -> RuntimeResult<Option<String>> {
  let row = sqlx::query_as::<_, (String, serde_json::Value)>(
    "SELECT status, cursor FROM blob_reconciliation_checkpoints WHERE kind = 'blob_cleanup_plan' AND scope = $1",
  )
  .bind(workspace_id)
  .fetch_optional(pool)
  .await
  .map_err(|err| RuntimeError::database("Blob cleanup plan checkpoint load failed", err))?;
  let Some((status, cursor)) = row else {
    return Ok(None);
  };
  if status == "completed" {
    return Ok(None);
  }
  Ok({
    cursor
      .get("lastBlobKey")
      .and_then(|value| value.as_str())
      .map(ToString::to_string)
  })
}

async fn upsert_plan_checkpoint(
  pool: &PgPool,
  workspace_id: &str,
  last_blob_key: Option<&str>,
  completed: bool,
) -> RuntimeResult<()> {
  let status = if completed { "completed" } else { "running" };
  sqlx::query(
    r#"
    INSERT INTO blob_reconciliation_checkpoints
      (kind, scope, status, cursor, last_key, completed_at)
    VALUES ('blob_cleanup_plan', $1, $2, $3, $4, CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE NULL END)
    ON CONFLICT (kind, scope) DO UPDATE
      SET status = EXCLUDED.status,
          cursor = EXCLUDED.cursor,
          last_key = COALESCE(EXCLUDED.last_key, blob_reconciliation_checkpoints.last_key),
          completed_at = CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
    "#,
  )
  .bind(workspace_id)
  .bind(status)
  .bind(serde_json::json!({ "lastBlobKey": last_blob_key }))
  .bind(last_blob_key)
  .bind(completed)
  .execute(pool)
  .await
  .map_err(|err| RuntimeError::database("Blob cleanup plan checkpoint write failed", err))?;
  Ok(())
}

async fn create_run(pool: &PgPool, workspace_id: &str) -> RuntimeResult<String> {
  sqlx::query_scalar::<_, String>(
    r#"
    INSERT INTO blob_reconciliation_runs (kind, mode, status, workspace_id)
    VALUES ('blob_cleanup_plan', 'mark_only', 'running', $1)
    RETURNING id::text
    "#,
  )
  .bind(workspace_id)
  .fetch_one(pool)
  .await
  .map_err(|err| RuntimeError::database("Blob cleanup create run failed", err))
}

async fn finish_run(
  pool: &PgPool,
  run_id: &str,
  workspace_id: &str,
  result: &RuntimeBlobCleanupPlanResult,
  stale_projection_workspaces: Vec<String>,
) -> RuntimeResult<()> {
  let candidate_bytes = sqlx::query_scalar::<_, Option<i64>>(
    "SELECT SUM(object_size)::bigint FROM blob_cleanup_candidates WHERE run_id = $1::uuid AND status = 'marked'",
  )
  .bind(run_id)
  .fetch_one(pool)
  .await
  .map_err(|err| RuntimeError::database("Blob cleanup candidate bytes audit failed", err))?
  .unwrap_or(0);
  sqlx::query(
    r#"
    UPDATE blob_reconciliation_runs
    SET status = 'finished',
        finished_at = CURRENT_TIMESTAMP,
        scanned = $2,
        changed = $3,
        metadata = $4
    WHERE id = $1::uuid
    "#,
  )
  .bind(run_id)
  .bind(result.scanned_blobs as i32)
  .bind(result.candidates_marked as i32)
  .bind(serde_json::json!({
    "protectedByDocRefs": result.protected_by_doc_refs,
    "protectedByMetadata": result.protected_by_metadata,
    "protectedByOtherRefs": result.protected_by_other_refs,
    "topWorkspaceCandidateBytes": [{
      "workspaceId": workspace_id,
      "candidateBytes": candidate_bytes,
    }],
    "staleOrFailedProjectionWorkspaces": stale_projection_workspaces,
  }))
  .execute(pool)
  .await
  .map_err(|err| RuntimeError::database("Blob cleanup finish run failed", err))?;
  Ok(())
}

async fn mark_candidate_status(
  pool: &PgPool,
  run_id: &str,
  workspace_id: &str,
  blob_key: &str,
  status: &str,
  evidence: serde_json::Value,
  error: Option<&str>,
) -> RuntimeResult<()> {
  sqlx::query(
    r#"
    UPDATE blob_cleanup_candidates
    SET status = $3,
        executed_at = CURRENT_TIMESTAMP,
        evidence = evidence || $4,
        error = $5
    WHERE workspace_id = $1 AND blob_key = $2 AND run_id = $6::uuid
    "#,
  )
  .bind(workspace_id)
  .bind(blob_key)
  .bind(status)
  .bind(evidence)
  .bind(error)
  .bind(run_id)
  .execute(pool)
  .await
  .map_err(|err| RuntimeError::database("Blob cleanup mark candidate status failed", err))?;
  Ok(())
}

async fn finish_execute_run(
  pool: &PgPool,
  run_id: &str,
  result: &RuntimeBlobCleanupExecuteResult,
) -> RuntimeResult<()> {
  sqlx::query(
    r#"
    UPDATE blob_reconciliation_runs
    SET status = 'finished',
        finished_at = CURRENT_TIMESTAMP,
        scanned = $2,
        changed = $3,
        failed = $4,
        metadata = metadata || $5
    WHERE id = $1::uuid
    "#,
  )
  .bind(run_id)
  .bind(result.scanned_candidates as i32)
  .bind(result.deleted_metadata as i32)
  .bind(result.failed as i32)
  .bind(serde_json::json!({
    "deletedObjects": result.deleted_objects,
    "deletedMetadata": result.deleted_metadata,
    "skippedStillReferenced": result.skipped_still_referenced,
    "failed": result.failed,
  }))
  .execute(pool)
  .await
  .map_err(|err| RuntimeError::database("Blob cleanup execute run finish failed", err))?;
  Ok(())
}

async fn mark_candidate(
  pool: &PgPool,
  run_id: &str,
  row: &BlobCandidateRow,
  object_size: i64,
  object_last_modified: DateTime<Utc>,
) -> RuntimeResult<i64> {
  let result = sqlx::query(
    r#"
    INSERT INTO blob_cleanup_candidates
      (workspace_id, blob_key, reason, status, object_size, object_last_modified, run_id, evidence)
    VALUES ($1, $2, 'unreferenced_completed_blob', 'marked', $3, $4, $5::uuid, $6)
    ON CONFLICT (workspace_id, blob_key) DO UPDATE
      SET reason = EXCLUDED.reason,
          status = 'marked',
          object_size = EXCLUDED.object_size,
          object_last_modified = EXCLUDED.object_last_modified,
          planned_at = CURRENT_TIMESTAMP,
          run_id = EXCLUDED.run_id,
          evidence = EXCLUDED.evidence,
          error = NULL
    "#,
  )
  .bind(&row.workspace_id)
  .bind(&row.key)
  .bind(object_size)
  .bind(object_last_modified)
  .bind(run_id)
  .bind(serde_json::json!({ "metadataSize": row.size }))
  .execute(pool)
  .await
  .map_err(|err| RuntimeError::database("Blob cleanup mark candidate failed", err))?;
  Ok(result.rows_affected() as i64)
}

async fn load_marked_candidates(pool: &PgPool, run_id: &str, limit: i64) -> RuntimeResult<Vec<MarkedCandidateRow>> {
  sqlx::query_as::<_, MarkedCandidateRow>(
    r#"
    SELECT workspace_id, blob_key
    FROM blob_cleanup_candidates
    WHERE run_id = $1::uuid AND status IN ('marked', 'failed')
    ORDER BY CASE WHEN status = 'marked' THEN 0 ELSE 1 END, planned_at ASC
    LIMIT $2
    "#,
  )
  .bind(run_id)
  .bind(limit)
  .fetch_all(pool)
  .await
  .map_err(|err| RuntimeError::database("Blob cleanup load marked candidates failed", err))
}

#[napi_derive::napi]
impl StorageRuntime {
  #[napi]
  pub async fn plan_unreferenced_workspace_blobs(
    &self,
    workspace_id: String,
    grace_period_days: i64,
    limit: i64,
  ) -> napi::Result<RuntimeBlobCleanupPlanResult> {
    if limit <= 0 {
      return Err(napi_error("blob cleanup plan limit must be positive"));
    }
    if grace_period_days < 0 {
      return Err(napi_error("blob cleanup grace period must be non-negative"));
    }

    let pool = self.pool().await?;
    let run_id = create_run(&pool, &workspace_id).await?;
    let mut result = RuntimeBlobCleanupPlanResult {
      run_id: Some(run_id.clone()),
      scanned_blobs: 0,
      candidates_marked: 0,
      protected_by_doc_refs: 0,
      protected_by_metadata: 0,
      protected_by_other_refs: 0,
      next_cursor: None,
    };

    let cursor = load_plan_cursor(&pool, &workspace_id).await?;
    let stale_projection_workspaces = stale_projection_workspaces(&pool, &workspace_id).await?;
    if !metadata_backfill_is_complete(&pool, &workspace_id).await? || !stale_projection_workspaces.is_empty() {
      result.protected_by_metadata = load_completed_blobs(&pool, &workspace_id, cursor.as_deref(), limit)
        .await?
        .len() as i64;
      finish_run(&pool, &run_id, &workspace_id, &result, stale_projection_workspaces).await?;
      return Ok(result);
    }

    let min_last_modified = Utc::now() - Duration::days(grace_period_days);
    let rows = load_completed_blobs(&pool, &workspace_id, cursor.as_deref(), limit).await?;
    let has_more = rows.len() == limit as usize;
    let mut last_blob_key = None;
    for row in rows {
      result.scanned_blobs += 1;
      last_blob_key = Some(row.key.clone());
      if has_doc_ref(&pool, &row.workspace_id, &row.key).await? {
        result.protected_by_doc_refs += 1;
        continue;
      }
      if has_other_ref(&pool, &row.workspace_id, &row.key).await? {
        result.protected_by_other_refs += 1;
        continue;
      }
      let object_key = format!("{}/{}", row.workspace_id, row.key);
      let Some(metadata) = self.object_storage_head(object_key).await? else {
        result.protected_by_metadata += 1;
        continue;
      };
      let last_modified = DateTime::<Utc>::from_timestamp_millis(metadata.last_modified_ms)
        .ok_or_else(|| RuntimeError::invalid_state("blob cleanup object last modified is invalid"))?;
      if metadata.content_length != row.size as i64 || last_modified > min_last_modified {
        result.protected_by_metadata += 1;
        continue;
      }
      result.candidates_marked += mark_candidate(&pool, &run_id, &row, metadata.content_length, last_modified).await?;
    }
    if has_more {
      result.next_cursor = last_blob_key.clone();
    }
    upsert_plan_checkpoint(&pool, &workspace_id, last_blob_key.as_deref(), !has_more).await?;

    finish_run(&pool, &run_id, &workspace_id, &result, Vec::new()).await?;
    Ok(result)
  }

  #[napi]
  pub async fn execute_blob_cleanup_candidates(
    &self,
    run_id: String,
    grace_period_days: i64,
    limit: i64,
  ) -> napi::Result<RuntimeBlobCleanupExecuteResult> {
    if limit <= 0 {
      return Err(napi_error("blob cleanup execute limit must be positive"));
    }
    if grace_period_days < 0 {
      return Err(napi_error("blob cleanup grace period must be non-negative"));
    }

    let pool = self.pool().await?;
    let min_last_modified = Utc::now() - Duration::days(grace_period_days);
    let rows = load_marked_candidates(&pool, &run_id, limit).await?;
    let mut result = RuntimeBlobCleanupExecuteResult {
      scanned_candidates: rows.len() as i64,
      deleted_objects: 0,
      deleted_metadata: 0,
      skipped_still_referenced: 0,
      failed: 0,
      workspace_ids: Vec::new(),
    };
    let mut deletable_candidates = Vec::new();

    for row in rows {
      if projection_is_stale(&pool, &row.workspace_id).await?
        || has_doc_ref(&pool, &row.workspace_id, &row.blob_key).await?
        || has_other_ref(&pool, &row.workspace_id, &row.blob_key).await?
      {
        result.skipped_still_referenced += 1;
        mark_candidate_status(
          &pool,
          &run_id,
          &row.workspace_id,
          &row.blob_key,
          "skipped",
          serde_json::json!({ "skipReason": "referenced_or_projection_stale" }),
          None,
        )
        .await?;
        continue;
      }

      let object_key = format!("{}/{}", row.workspace_id, row.blob_key);
      let metadata = match self.object_storage_head(object_key.clone()).await {
        Ok(metadata) => metadata,
        Err(err) => {
          result.failed += 1;
          mark_candidate_status(
            &pool,
            &run_id,
            &row.workspace_id,
            &row.blob_key,
            "failed",
            serde_json::json!({ "failure": "object_head_failed" }),
            Some(&err.to_string()),
          )
          .await?;
          continue;
        }
      };
      if let Some(metadata) = metadata {
        let last_modified = DateTime::<Utc>::from_timestamp_millis(metadata.last_modified_ms)
          .ok_or_else(|| RuntimeError::invalid_state("blob cleanup execute object last modified is invalid"))?;
        if last_modified > min_last_modified {
          result.skipped_still_referenced += 1;
          mark_candidate_status(
            &pool,
            &run_id,
            &row.workspace_id,
            &row.blob_key,
            "skipped",
            serde_json::json!({ "skipReason": "object_inside_grace_period" }),
            None,
          )
          .await?;
          continue;
        }
        deletable_candidates.push(DeletableCandidate {
          workspace_id: row.workspace_id,
          blob_key: row.blob_key,
          object_key,
        });
        continue;
      }

      let deleted_metadata =
        match sqlx::query("DELETE FROM blobs WHERE workspace_id = $1 AND key = $2 AND deleted_at IS NULL")
          .bind(&row.workspace_id)
          .bind(&row.blob_key)
          .execute(&pool)
          .await
        {
          Ok(result) => result.rows_affected() as i64,
          Err(err) => {
            result.failed += 1;
            mark_candidate_status(
              &pool,
              &run_id,
              &row.workspace_id,
              &row.blob_key,
              "failed",
              serde_json::json!({ "failure": "metadata_delete_failed" }),
              Some(&err.to_string()),
            )
            .await?;
            continue;
          }
        };
      result.deleted_metadata += deleted_metadata;
      push_workspace_once(&mut result.workspace_ids, &row.workspace_id);

      mark_candidate_status(
        &pool,
        &run_id,
        &row.workspace_id,
        &row.blob_key,
        "executed",
        serde_json::json!({
          "deletedMetadata": deleted_metadata,
          "objectMissingBeforeDelete": true,
        }),
        None,
      )
      .await?;
    }

    if !deletable_candidates.is_empty() {
      let object_keys = deletable_candidates
        .iter()
        .map(|candidate| candidate.object_key.clone())
        .collect::<Vec<_>>();
      let outcomes = match self.object_storage_delete_many(object_keys.clone()).await {
        Ok(outcomes) => outcomes,
        Err(err) => object_keys
          .into_iter()
          .map(|key| super::object_storage::types::ObjectDeleteOutcome {
            key,
            error: Some(err.to_string()),
          })
          .collect(),
      };
      let mut outcomes_by_key = outcomes
        .into_iter()
        .map(|outcome| (outcome.key, outcome.error))
        .collect::<HashMap<_, _>>();

      for row in deletable_candidates {
        let delete_error = match outcomes_by_key.remove(&row.object_key) {
          Some(Some(error)) => Some(error),
          Some(None) => None,
          None => Some("DeleteObjects response did not include this key".to_string()),
        };
        if let Some(error) = delete_error {
          result.failed += 1;
          mark_candidate_status(
            &pool,
            &run_id,
            &row.workspace_id,
            &row.blob_key,
            "failed",
            serde_json::json!({ "failure": "object_delete_failed" }),
            Some(&error),
          )
          .await?;
          continue;
        }
        result.deleted_objects += 1;

        let deleted_metadata =
          match sqlx::query("DELETE FROM blobs WHERE workspace_id = $1 AND key = $2 AND deleted_at IS NULL")
            .bind(&row.workspace_id)
            .bind(&row.blob_key)
            .execute(&pool)
            .await
          {
            Ok(result) => result.rows_affected() as i64,
            Err(err) => {
              result.failed += 1;
              mark_candidate_status(
                &pool,
                &run_id,
                &row.workspace_id,
                &row.blob_key,
                "failed",
                serde_json::json!({ "failure": "metadata_delete_failed" }),
                Some(&err.to_string()),
              )
              .await?;
              continue;
            }
          };
        result.deleted_metadata += deleted_metadata;
        push_workspace_once(&mut result.workspace_ids, &row.workspace_id);

        mark_candidate_status(
          &pool,
          &run_id,
          &row.workspace_id,
          &row.blob_key,
          "executed",
          serde_json::json!({
            "deletedMetadata": deleted_metadata,
            "objectMissingBeforeDelete": false,
          }),
          None,
        )
        .await?;
      }
    }

    finish_execute_run(&pool, &run_id, &result).await?;
    Ok(result)
  }
}
