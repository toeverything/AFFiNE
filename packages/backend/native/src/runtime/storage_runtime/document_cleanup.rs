use std::collections::HashSet;

use affine_core::access_control::classify_reserved_document;
use chrono::{DateTime, Utc};
use serde_json::json;
use sqlx::{FromRow, PgPool, Row};

use super::{
  DocumentCleanupOutcome, RuntimeDocumentCleanupExecuteResult, RuntimeDocumentCleanupReconcileResult, RuntimeError,
  RuntimeResult, StorageRuntime, execute_document_cleanup_candidate, load_workspace_live_doc_ids, napi_error,
};

#[derive(FromRow)]
struct StoredDocActivity {
  doc_id: String,
  last_activity_at: DateTime<Utc>,
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
  let mut live_ids = match load_workspace_live_doc_ids(&pool, workspace_id).await {
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
    if classify_reserved_document(workspace_id, &doc.doc_id).is_valid_reserved() {
      live_ids.insert(doc.doc_id.clone());
      continue;
    }
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
        SET status = 'marked',
            missing_since = CASE
              WHEN document_cleanup_candidates.last_doc_activity_at IS DISTINCT FROM EXCLUDED.last_doc_activity_at
                THEN EXCLUDED.missing_since
              ELSE document_cleanup_candidates.missing_since
            END,
            last_observed_missing_at = EXCLUDED.last_observed_missing_at,
            last_doc_activity_at = EXCLUDED.last_doc_activity_at,
            error = NULL,
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
      Some(row) if row.get::<Option<DateTime<Utc>>, _>("last_doc_activity_at") != Some(doc.last_activity_at) => {
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
  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("Document cleanup reconcile commit failed", err))?;

  Ok(result)
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
    };
    let mut busy_workspaces = Vec::new();
    for _ in 0..limit {
      let mut retries = 0;
      let outcome = loop {
        match execute_document_cleanup_candidate(&pool, workspace_id.as_deref(), grace_period_days, &busy_workspaces)
          .await
        {
          Err(err) if err.is_serialization_failure() && retries < 3 => {
            retries += 1;
            result.serialization_retries += 1;
          }
          result => break result,
        }
      }?;
      let Some((candidate, outcome)) = outcome else { break };
      result.scanned_candidates += 1;
      match outcome {
        DocumentCleanupOutcome::Busy => busy_workspaces.push(candidate.workspace_id),
        DocumentCleanupOutcome::Recovered => result.recovered += 1,
        DocumentCleanupOutcome::Reset => result.reset += 1,
        DocumentCleanupOutcome::Failed => result.failed += 1,
        DocumentCleanupOutcome::Deleted(rows) => {
          result.executed += 1;
          result.deleted_rows += rows;
        }
      }
    }
    Ok(result)
  }
}

#[cfg(test)]
mod tests {
  use std::{collections::HashMap, sync::RwLock};

  use anyhow::{Context, Result as AnyResult};
  use napi::bindgen_prelude::Buffer;
  use serde_json::Value;
  use sqlx::postgres::PgPoolOptions;
  use tokio::sync::Mutex;
  use uuid::Uuid;

  use super::*;
  use crate::runtime::{
    backend_runtime::SEARCH_TEST_LOCK,
    migrations::{migrate_runtime_tables, migrate_search_tables},
    storage_runtime::StorageRuntimeConfig,
  };

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
        object_storage: crate::runtime::object_storage::ObjectStorageService {
          backends: HashMap::new(),
        },
      }),
      pool: Mutex::new(Some(pool.clone())),
    };
    Ok(Some((runtime, pool)))
  }

  async fn insert_user_workspace(pool: &PgPool, suffix: &str) -> AnyResult<(String, String)> {
    let user_id = format!("rust-test-dc-user-{suffix}");
    let workspace_id = format!("rust-test-dc-ws-{suffix}");
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
    sqlx::query("DELETE FROM storage_reconciliation_checkpoints WHERE scope = $1")
      .bind(workspace_id)
      .execute(pool)
      .await?;
    for table in [
      "document_cleanup_candidates",
      "doc_blob_refs",
      "doc_blob_ref_projections",
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
    let _search_guard = SEARCH_TEST_LOCK.lock().await;
    let Some((runtime, pool)) = runtime_from_database_url().await? else {
      eprintln!("skipping postgres integration test: DATABASE_URL is not set");
      return Ok(());
    };
    migrate_search_tables(&pool)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    let workspace_id = format!("rust-test-dc-{}", Uuid::new_v4());
    let doc_id = "missing-doc";
    let root = affine_doc_loader::add_doc_to_root_doc(Vec::new(), "live-doc", None)?;
    let live_doc = affine_doc_loader::build_full_doc("Live", "", "live-doc")?;
    let doc = affine_doc_loader::build_full_doc("Missing", "![Asset](blob://candidate-blob)", doc_id)?;
    sqlx::query("INSERT INTO workspaces (id, created_at) VALUES ($1, CURRENT_TIMESTAMP)")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
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
    assert_eq!(projection.failed_docs, 1);
    assert_eq!(projection.parsed_docs, 2);
    let projection_checkpoint = sqlx::query(
      "SELECT status, metadata FROM storage_reconciliation_checkpoints WHERE kind = 'doc_blob_refs' AND scope = $1",
    )
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(projection_checkpoint.get::<Value, _>("metadata")["shadowMismatches"], 1);
    assert_eq!(projection_checkpoint.get::<String, _>("status"), "completed");
    assert_eq!(projection_checkpoint.get::<Value, _>("metadata")["failedDocs"], 1);
    let root_projection =
      sqlx::query("SELECT status, error_code FROM doc_blob_ref_projections WHERE workspace_id = $1 AND doc_id = $1")
        .bind(&workspace_id)
        .fetch_one(&pool)
        .await?;
    assert_eq!(root_projection.get::<String, _>("status"), "failed");
    assert_eq!(root_projection.get::<String, _>("error_code"), "yocto_unsupported");
    sqlx::query(
      "INSERT INTO blobs (workspace_id, key, size, mime, status, created_at) VALUES ($1, 'unknown-ref', 1, \
       'application/octet-stream', 'completed', CURRENT_TIMESTAMP - INTERVAL '90 days')",
    )
    .bind(&workspace_id)
    .execute(&pool)
    .await?;
    let cleanup = runtime
      .cleanup_unreferenced_workspace_blobs(workspace_id.clone(), 30, 100)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!(
      (
        cleanup.scanned_blobs,
        cleanup.protected_by_metadata,
        cleanup.deleted_objects,
        cleanup.deleted_metadata,
        cleanup.failed
      ),
      (0, 1, 0, 0, 0)
    );
    assert_eq!(
      sqlx::query_scalar::<_, String>(
        "SELECT status FROM doc_blob_ref_projections WHERE workspace_id = $1 AND doc_id = 'live-doc'",
      )
      .bind(&workspace_id)
      .fetch_one(&pool)
      .await?,
      "fresh"
    );
    let unchanged = runtime
      .rebuild_workspace_doc_blob_refs(workspace_id.clone(), 100)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!(unchanged.parsed_docs, 0);

    sqlx::query(
      "INSERT INTO updates (workspace_id, guid, blob, created_at) VALUES ($1, 'live-doc', $2, CURRENT_TIMESTAMP)",
    )
    .bind(&workspace_id)
    .bind(affine_doc_loader::build_full_doc("Live pending", "", "live-doc")?)
    .execute(&pool)
    .await?;
    let pending = runtime
      .rebuild_workspace_doc_blob_refs(workspace_id.clone(), 100)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!(pending.failed_docs, 1);
    assert_eq!(
      sqlx::query_scalar::<_, String>(
        "SELECT status FROM doc_blob_ref_projections WHERE workspace_id = $1 AND doc_id = 'live-doc'",
      )
      .bind(&workspace_id)
      .fetch_one(&pool)
      .await?,
      "pending"
    );
    sqlx::query("DELETE FROM updates WHERE workspace_id = $1 AND guid = 'live-doc'")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    let repaired = runtime
      .rebuild_workspace_doc_blob_refs(workspace_id.clone(), 100)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!(repaired.parsed_docs, 1);
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

    sqlx::query(
      "UPDATE snapshots SET blob = $2, updated_at = updated_at + interval '1 millisecond' WHERE workspace_id = $1 AND \
       guid = 'live-doc'",
    )
    .bind(&workspace_id)
    .bind(vec![0xff_u8])
    .execute(&pool)
    .await?;
    let corrupt_timestamp = sqlx::query_scalar::<_, DateTime<Utc>>(
      "SELECT updated_at FROM snapshots WHERE workspace_id=$1 AND guid='live-doc'",
    )
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await?;
    let corrupt = runtime
      .rebuild_doc_blob_refs(
        workspace_id.clone(),
        "live-doc".to_string(),
        corrupt_timestamp.timestamp_millis(),
      )
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!(corrupt.failed_docs, 1);
    assert_eq!(
      sqlx::query_scalar::<_, String>(
        "SELECT error_code FROM doc_blob_ref_projections WHERE workspace_id=$1 AND doc_id='live-doc'",
      )
      .bind(&workspace_id)
      .fetch_one(&pool)
      .await?,
      "invalid_binary_corrupt"
    );
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

    let drained = runtime
      .rebuild_workspace_doc_blob_refs(workspace_id.clone(), 100)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!((drained.failed_docs, drained.next_cursor), (2, None));
    assert_eq!(
      sqlx::query_scalar::<_, String>(
        "SELECT status FROM doc_blob_ref_projections WHERE workspace_id = $1 AND doc_id = $2",
      )
      .bind(&workspace_id)
      .bind(doc_id)
      .fetch_one(&pool)
      .await?,
      "fresh"
    );

    sqlx::query(
      "UPDATE storage_reconciliation_checkpoints SET status = 'failed', cursor = '{\"lastDocId\":\"live-doc\"}', \
       metadata = '{\"parserVersion\":1,\"failedDocs\":99}' WHERE kind = 'doc_blob_refs' AND scope = $1",
    )
    .bind(&workspace_id)
    .execute(&pool)
    .await?;
    let resumed = runtime
      .rebuild_workspace_doc_blob_refs(workspace_id.clone(), 1)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!(
      (resumed.failed_docs, resumed.next_cursor.as_deref()),
      (0, Some("missing-doc"))
    );
    let resumed_checkpoint = sqlx::query(
      "SELECT status, metadata FROM storage_reconciliation_checkpoints WHERE kind = 'doc_blob_refs' AND scope = $1",
    )
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(resumed_checkpoint.get::<String, _>("status"), "running");
    assert_eq!(resumed_checkpoint.get::<Value, _>("metadata")["failedDocs"], 0);

    sqlx::query("UPDATE snapshots SET blob = $2 WHERE workspace_id = $1 AND guid = 'live-doc'")
      .bind(&workspace_id)
      .bind(affine_doc_loader::build_full_doc("Live", "", "live-doc")?)
      .execute(&pool)
      .await?;
    let recovered_projection = runtime
      .rebuild_workspace_doc_blob_refs(workspace_id.clone(), 100)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!(recovered_projection.failed_docs, 1);
    assert_eq!(
      sqlx::query_scalar::<_, String>(
        "SELECT status FROM storage_reconciliation_checkpoints WHERE kind = 'doc_blob_refs' AND scope = $1",
      )
      .bind(&workspace_id)
      .fetch_one(&pool)
      .await?,
      "completed"
    );

    let retried = runtime
      .rebuild_workspace_doc_blob_refs(workspace_id.clone(), 100)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!((retried.parsed_docs, retried.failed_docs), (1, 1));
    assert_eq!(
      sqlx::query_scalar::<_, String>(
        "SELECT status FROM doc_blob_ref_projections WHERE workspace_id = $1 AND doc_id = 'live-doc'",
      )
      .bind(&workspace_id)
      .fetch_one(&pool)
      .await?,
      "fresh"
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
    assert_eq!((parser_upgrade.scanned_docs, parser_upgrade.failed_docs), (3, 1));
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

    assert!(
      runtime
        .rebuild_workspace_doc_blob_refs(workspace_id.clone(), 100)
        .await
        .is_err()
    );

    sqlx::query("DELETE FROM storage_reconciliation_checkpoints WHERE scope = $1")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    sqlx::query("DELETE FROM doc_blob_refs WHERE workspace_id = $1")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    sqlx::query("DELETE FROM doc_blob_ref_projections WHERE workspace_id = $1")
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
    sqlx::query("DELETE FROM blobs WHERE workspace_id = $1")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    sqlx::query("DELETE FROM workspaces WHERE id = $1")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    Ok(())
  }

  #[tokio::test]
  async fn document_cleanup_execute_postgres_semantics() -> AnyResult<()> {
    let _search_guard = SEARCH_TEST_LOCK.lock().await;
    let Some((runtime, pool)) = runtime_from_database_url().await? else {
      eprintln!("skipping postgres integration test: DATABASE_URL is not set");
      return Ok(());
    };
    migrate_search_tables(&pool)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    sqlx::query("DELETE FROM search_projection.generations WHERE state='building'")
      .execute(&pool)
      .await?;
    let suffix = Uuid::new_v4().to_string();
    let (user_id, workspace_id) = insert_user_workspace(&pool, &suffix).await?;
    let object_root = tempfile::tempdir()?;
    runtime.config.write().unwrap().object_storage.backends.insert(
      "blob".to_string(),
      crate::runtime::object_storage::StorageBackendConfig::Fs(crate::runtime::object_storage::FsStorageConfig {
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
    let reserved_db_doc_id = format!("db${workspace_id}$docProperties");
    let reserved_userdata_doc_id = format!("userdata${user_id}${workspace_id}$settings");
    let invalid_db_doc_id = "db$docProperties";
    let invalid_userdata_doc_id = format!("userdata$__local__${workspace_id}$favorite");
    for internal_doc_id in [
      reserved_db_doc_id.as_str(),
      reserved_userdata_doc_id.as_str(),
      invalid_db_doc_id,
      invalid_userdata_doc_id.as_str(),
    ] {
      sqlx::query(
        "INSERT INTO snapshots (workspace_id, guid, blob, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP - \
         INTERVAL '90 days')",
      )
      .bind(&workspace_id)
      .bind(internal_doc_id)
      .bind(affine_doc_loader::build_full_doc("Internal", "", internal_doc_id)?)
      .execute(&pool)
      .await?;
    }
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
    assert_eq!(mark.marked, 3);
    let marked_doc_ids = sqlx::query_scalar::<_, String>(
      "SELECT doc_id FROM document_cleanup_candidates WHERE workspace_id = $1 ORDER BY doc_id",
    )
    .bind(&workspace_id)
    .fetch_all(&pool)
    .await?;
    assert_eq!(marked_doc_ids.len(), 3);
    for doc_id in [doc_id, invalid_db_doc_id, invalid_userdata_doc_id.as_str()] {
      assert!(marked_doc_ids.iter().any(|marked| marked == doc_id));
    }
    for doc_id in [&reserved_db_doc_id, &reserved_userdata_doc_id] {
      assert!(!marked_doc_ids.iter().any(|marked| marked == doc_id));
    }
    sqlx::query(
      "INSERT INTO document_cleanup_candidates (workspace_id, doc_id, status, missing_since, \
       last_observed_missing_at, last_doc_activity_at) VALUES ($1, $2, 'marked', CURRENT_TIMESTAMP - INTERVAL '31 \
       days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP - INTERVAL '90 days')",
    )
    .bind(&workspace_id)
    .bind(&reserved_db_doc_id)
    .execute(&pool)
    .await?;
    let busy = super::super::StorageOperation::acquire(&pool, &workspace_id, Some("in-flight-upload")).await?;
    let (other_user, other_workspace) = insert_user_workspace(&pool, &format!("other-{suffix}")).await?;
    let other_reserved_doc = format!("db${other_workspace}$docProperties");
    sqlx::query(
      "INSERT INTO document_cleanup_candidates(workspace_id,doc_id,status,missing_since,last_observed_missing_at) \
       VALUES($1,$2,'marked',now()-interval '30 days',now())",
    )
    .bind(&other_workspace)
    .bind(&other_reserved_doc)
    .execute(&pool)
    .await?;
    let progress = tokio::time::timeout(
      std::time::Duration::from_secs(2),
      runtime.execute_document_cleanup_candidates(None, 30, 100),
    )
    .await??;
    assert!(
      progress.recovered >= 1,
      "a busy workspace must not block another candidate"
    );
    assert_eq!(
      sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM document_cleanup_candidates WHERE workspace_id=$1 AND doc_id=$2"
      )
      .bind(&workspace_id)
      .bind(&reserved_db_doc_id)
      .fetch_one(&pool)
      .await?,
      1
    );
    assert_eq!(
      sqlx::query_scalar::<_, i64>("SELECT count(*) FROM document_cleanup_candidates WHERE workspace_id=$1")
        .bind(&other_workspace)
        .fetch_one(&pool)
        .await?,
      0
    );
    busy.release().await?;
    cleanup_workspace_fixture(&pool, &other_user, &other_workspace).await?;
    let recovered_reserved = execute_document_cleanup_candidate(&pool, Some(&workspace_id), 30, &[])
      .await?
      .unwrap();
    assert_eq!(recovered_reserved.0.doc_id, reserved_db_doc_id);
    assert_eq!(recovered_reserved.1, DocumentCleanupOutcome::Recovered);
    assert_eq!(
      sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM snapshots WHERE workspace_id = $1 AND guid = $2")
        .bind(&workspace_id)
        .bind(&reserved_db_doc_id)
        .fetch_one(&pool)
        .await?,
      1
    );
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
    assert_eq!(refs.failed_docs, 1);
    let ref_count = sqlx::query_scalar::<_, i64>(
      "SELECT COUNT(*) FROM doc_blob_refs WHERE workspace_id = $1 AND doc_id = $2 AND blob_key = 'image-blob-key'",
    )
    .bind(&workspace_id)
    .bind(doc_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(ref_count, 0);
    assert_eq!(
      sqlx::query_scalar::<_, String>(
        "SELECT status FROM doc_blob_ref_projections WHERE workspace_id = $1 AND doc_id = $2",
      )
      .bind(&workspace_id)
      .bind(doc_id)
      .fetch_one(&pool)
      .await?,
      "pending"
    );
    let not_due = execute_document_cleanup_candidate(&pool, Some(&workspace_id), 30, &[]).await?;
    assert!(not_due.is_none());

    let session_id = format!("session:{suffix}");
    let prompt_name = format!("p_{}", &suffix[..30]);
    if sqlx::query_scalar::<_, Option<String>>("SELECT to_regclass('ai_prompts_metadata')::text")
      .fetch_one(&pool)
      .await?
      .is_some()
    {
      sqlx::query(
        "INSERT INTO ai_prompts_metadata (name, model, created_at, updated_at) VALUES ($1, 'test-model', \
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT (name) DO NOTHING",
      )
      .bind(&prompt_name)
      .execute(&pool)
      .await?;
    }
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
      "UPDATE document_cleanup_candidates SET missing_since = CURRENT_TIMESTAMP - INTERVAL '31 days' WHERE \
       workspace_id = $1 AND doc_id = $2",
    )
    .bind(&workspace_id)
    .bind(doc_id)
    .execute(&pool)
    .await?;
    let generation_id = Uuid::new_v4();
    sqlx::query(
      r#"INSERT INTO search_projection.generations(id,provider,state,config_hash,schema_version)
         VALUES($1,'embedded','building',decode(repeat('00',32),'hex'),1)"#,
    )
    .bind(generation_id)
    .execute(&pool)
    .await?;
    let executed = runtime
      .execute_document_cleanup_candidates(Some(workspace_id.clone()), 30, 10)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!(executed.executed, 1);
    assert_eq!(executed.failed, 0);
    let search_delete_tasks = sqlx::query_scalar::<_, i64>(
      "SELECT COUNT(*) FROM search_projection.document_states WHERE generation_id = $1 AND workspace_id = $2 AND \
       doc_id = $3",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .bind(doc_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(search_delete_tasks, 1);
    assert!(
      runtime
        .head_object("blob".to_string(), attachment_object_key.clone())
        .await
        .map_err(|err| anyhow::anyhow!(err.to_string()))?
        .is_some()
    );
    let metadata_path = object_root
      .path()
      .join("document-cleanup-test")
      .join(format!("{attachment_object_key}.metadata.json"));
    let mut metadata: Value = serde_json::from_slice(&std::fs::read(&metadata_path)?)?;
    metadata["lastModified"] = serde_json::json!((Utc::now() - chrono::Duration::hours(25)).timestamp_millis());
    std::fs::write(&metadata_path, serde_json::to_vec(&metadata)?)?;
    let reconciled = runtime
      .reconcile_workspace_storage(1000)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!(reconciled.deleted_objects, 1);
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
      ("doc_blob_ref_projections", "doc_id"),
      ("ai_workspace_ignored_docs", "doc_id"),
      ("comments", "doc_id"),
      ("comment_attachments", "doc_id"),
      ("replies", "doc_id"),
      ("workspace_doc_view_daily", "doc_id"),
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

    let cleaned_invalid_attachment = runtime
      .execute_document_cleanup_candidates(Some(workspace_id.clone()), 30, 10)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!(cleaned_invalid_attachment.executed, 1);
    assert_eq!(cleaned_invalid_attachment.failed, 0);
    let retry_candidate_count = sqlx::query_scalar::<_, i64>(
      "SELECT COUNT(*) FROM document_cleanup_candidates WHERE workspace_id = $1 AND doc_id = $2",
    )
    .bind(&workspace_id)
    .bind(retry_doc_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(retry_candidate_count, 0);

    sqlx::query("DELETE FROM search_projection.generations WHERE id = $1")
      .bind(generation_id)
      .execute(&pool)
      .await?;
    cleanup_workspace_fixture(&pool, &user_id, &workspace_id).await?;
    Ok(())
  }
}
