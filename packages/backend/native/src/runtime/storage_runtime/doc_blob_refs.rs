use affine_doc_loader as doc_loader;
use chrono::{DateTime, Utc};
use sqlx::{Executor, FromRow, PgPool, Postgres};

use super::{
  CurrentDoc, RuntimeDocBlobRefsResult, RuntimeError, RuntimeResult, StorageRuntime, load_canonical_doc,
  load_workspace_canonical_doc_ids, napi_error,
};

pub(super) const PARSER_VERSION: i32 = 1;
const ERROR_SUMMARY_LIMIT: usize = 512;

type ExtractedRef = doc_loader::BlobRef;

#[derive(FromRow)]
struct DocSource {
  updated_at: DateTime<Utc>,
  has_pending_updates: bool,
}

#[derive(Default)]
struct ProjectionState {
  cursor: Option<String>,
  failed_docs: i64,
}

#[derive(Default)]
struct ProjectionStats {
  result: RuntimeDocBlobRefsResult,
  pending_docs: i64,
  missing_docs: i64,
  shadow_mismatches: i64,
}

#[derive(Default)]
struct ProjectionAttempt {
  written: i64,
  deleted: i64,
  shadow_mismatch: bool,
}

enum ProjectionOutcome {
  Fresh(ProjectionAttempt),
  Pending,
  Missing,
}

async fn load_workspace_doc_ids(pool: &PgPool, workspace_id: &str) -> RuntimeResult<Vec<String>> {
  let mut ids = load_workspace_canonical_doc_ids(pool, workspace_id).await?;
  ids.push(workspace_id.to_string());
  let retained = sqlx::query_scalar::<_, String>(
    "SELECT doc_id FROM document_cleanup_candidates WHERE workspace_id = $1 AND status IN ('marked', 'failed') ORDER \
     BY doc_id",
  )
  .bind(workspace_id)
  .fetch_all(pool)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs candidate load failed", err))?;
  ids.extend(retained);
  ids.sort();
  ids.dedup();
  Ok(ids)
}

async fn load_doc_source(pool: &PgPool, workspace_id: &str, doc_id: &str) -> RuntimeResult<Option<DocSource>> {
  sqlx::query_as::<_, DocSource>(
    r#"
    SELECT s.updated_at,
           EXISTS(
             SELECT 1 FROM updates u
             WHERE u.workspace_id = s.workspace_id AND u.guid = s.guid
           ) AS has_pending_updates
    FROM snapshots s
    WHERE s.workspace_id = $1 AND s.guid = $2
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(pool)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs source load failed", err))
}

async fn projection_is_fresh(
  pool: &PgPool,
  workspace_id: &str,
  doc_id: &str,
  source_revision: DateTime<Utc>,
) -> RuntimeResult<bool> {
  sqlx::query_scalar::<_, bool>(
    r#"
    SELECT EXISTS(
      SELECT 1 FROM doc_blob_ref_projections
      WHERE workspace_id = $1
        AND doc_id = $2
        AND source_revision = $3
        AND parser_version = $4
        AND status = 'fresh'
    )
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(source_revision)
  .bind(PARSER_VERSION)
  .fetch_one(pool)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs projection freshness load failed", err))
}

fn truncate_error_summary(error: &str) -> String {
  let mut end = error.len().min(ERROR_SUMMARY_LIMIT);
  while end > 0 && !error.is_char_boundary(end) {
    end -= 1;
  }
  error[..end].to_string()
}

async fn upsert_projection_state<'e, E>(
  executor: E,
  workspace_id: &str,
  doc_id: &str,
  source_revision: Option<DateTime<Utc>>,
  status: &str,
  error_code: Option<&str>,
  error_summary: Option<&str>,
) -> RuntimeResult<()>
where
  E: Executor<'e, Database = Postgres>,
{
  sqlx::query(
    r#"
    INSERT INTO doc_blob_ref_projections
      (workspace_id, doc_id, source_revision, parser_version, status, indexed_at, error_code, error_summary, attempt_count)
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7, CASE WHEN $5 = 'fresh' THEN 0 ELSE 1 END)
    ON CONFLICT (workspace_id, doc_id) DO UPDATE
      SET source_revision = EXCLUDED.source_revision,
          parser_version = EXCLUDED.parser_version,
          status = EXCLUDED.status,
          indexed_at = EXCLUDED.indexed_at,
          error_code = EXCLUDED.error_code,
          error_summary = EXCLUDED.error_summary,
          attempt_count = CASE
            WHEN EXCLUDED.status = 'fresh' THEN 0
            ELSE doc_blob_ref_projections.attempt_count + 1
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE (
        EXCLUDED.source_revision IS NULL
        AND doc_blob_ref_projections.source_revision IS NULL
        AND doc_blob_ref_projections.parser_version <= EXCLUDED.parser_version
      ) OR (
        EXCLUDED.source_revision IS NOT NULL
        AND doc_blob_ref_projections.parser_version <= EXCLUDED.parser_version
        AND (
          doc_blob_ref_projections.source_revision IS NULL
          OR EXCLUDED.source_revision >= doc_blob_ref_projections.source_revision
        )
      )
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(source_revision)
  .bind(PARSER_VERSION)
  .bind(status)
  .bind(error_code)
  .bind(error_summary.map(truncate_error_summary))
  .execute(executor)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs projection state write failed", err))?;
  Ok(())
}

async fn upsert_projection_checkpoint(
  pool: &PgPool,
  workspace_id: &str,
  result: &RuntimeDocBlobRefsResult,
  pending_docs: i64,
  missing_docs: i64,
  shadow_mismatches: i64,
) -> RuntimeResult<()> {
  let status = if result.next_cursor.is_some() {
    "running"
  } else if result.failed_docs > 0 {
    "failed"
  } else {
    "completed"
  };
  let completed = status == "completed";
  sqlx::query(
    r#"
    INSERT INTO storage_reconciliation_checkpoints
      (kind, scope, status, cursor, completed_at, metadata)
    VALUES ('doc_blob_refs', $1, $2, $3, CASE WHEN $4 THEN CURRENT_TIMESTAMP ELSE NULL END, $5)
    ON CONFLICT (kind, scope) DO UPDATE
      SET status = EXCLUDED.status,
          cursor = EXCLUDED.cursor,
          completed_at = CASE WHEN $4 THEN CURRENT_TIMESTAMP ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP,
          metadata = EXCLUDED.metadata
    "#,
  )
  .bind(workspace_id)
  .bind(status)
  .bind(serde_json::json!({ "lastDocId": result.next_cursor }))
  .bind(completed)
  .bind(serde_json::json!({
    "parserVersion": PARSER_VERSION,
    "failedDocs": result.failed_docs,
    "pendingDocs": pending_docs,
    "missingDocs": missing_docs,
    "shadowMismatches": shadow_mismatches,
  }))
  .execute(pool)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs checkpoint write failed", err))?;
  Ok(())
}

async fn upsert_projection_failure_checkpoint(pool: &PgPool, workspace_id: &str) -> RuntimeResult<()> {
  sqlx::query(
    r#"
    INSERT INTO storage_reconciliation_checkpoints
      (kind, scope, status, cursor, completed_at, metadata)
    VALUES ('doc_blob_refs', $1, 'failed', '{}', NULL, $2)
    ON CONFLICT (kind, scope) DO UPDATE
      SET status = 'failed',
          cursor = '{}',
          completed_at = NULL,
          updated_at = CURRENT_TIMESTAMP,
          metadata = EXCLUDED.metadata
    "#,
  )
  .bind(workspace_id)
  .bind(serde_json::json!({
    "parserVersion": PARSER_VERSION,
    "errorCode": "root_projection_failed",
  }))
  .execute(pool)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs failure checkpoint write failed", err))?;
  Ok(())
}

async fn load_projection_state(pool: &PgPool, workspace_id: &str) -> RuntimeResult<ProjectionState> {
  let checkpoint = sqlx::query_as::<_, (String, serde_json::Value, serde_json::Value)>(
    "SELECT status, cursor, metadata FROM storage_reconciliation_checkpoints WHERE kind = 'doc_blob_refs' AND scope = \
     $1",
  )
  .bind(workspace_id)
  .fetch_optional(pool)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs checkpoint load failed", err))?;
  let Some((status, cursor, metadata)) = checkpoint else {
    return Ok(ProjectionState::default());
  };
  if status != "running" && status != "failed"
    || metadata.get("parserVersion").and_then(serde_json::Value::as_i64) != Some(i64::from(PARSER_VERSION))
  {
    return Ok(ProjectionState::default());
  }
  Ok(ProjectionState {
    cursor: cursor
      .get("lastDocId")
      .and_then(|value| value.as_str())
      .map(ToString::to_string),
    failed_docs: if status == "running" {
      metadata
        .get("failedDocs")
        .and_then(serde_json::Value::as_i64)
        .unwrap_or(0)
    } else {
      0
    },
  })
}

async fn purge_removed_doc_projections(
  pool: &PgPool,
  workspace_id: &str,
  current_doc_ids: &[String],
) -> RuntimeResult<i64> {
  let refs = sqlx::query("DELETE FROM doc_blob_refs WHERE workspace_id = $1 AND NOT (doc_id = ANY($2))")
    .bind(workspace_id)
    .bind(current_doc_ids)
    .execute(pool)
    .await
    .map_err(|err| RuntimeError::database("Doc blob refs purge removed docs failed", err))?
    .rows_affected() as i64;
  sqlx::query("DELETE FROM doc_blob_ref_projections WHERE workspace_id = $1 AND NOT (doc_id = ANY($2))")
    .bind(workspace_id)
    .bind(current_doc_ids)
    .execute(pool)
    .await
    .map_err(|err| RuntimeError::database("Doc blob ref projections purge removed docs failed", err))?;
  Ok(refs)
}

fn extract_refs(blob: Vec<u8>) -> RuntimeResult<Vec<ExtractedRef>> {
  doc_loader::get_blob_refs_from_binary(blob)
    .map_err(|err| RuntimeError::invalid_state(format!("Doc blob refs parse failed: {err}")))
}

async fn replace_doc_refs_if_current(
  pool: &PgPool,
  workspace_id: &str,
  doc_id: &str,
  source_revision: DateTime<Utc>,
  refs: Vec<ExtractedRef>,
) -> RuntimeResult<ProjectionOutcome> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|err| RuntimeError::database("Doc blob refs transaction failed", err))?;
  let current = sqlx::query_as::<_, (DateTime<Utc>, bool)>(
    r#"
    SELECT s.updated_at,
           EXISTS(
             SELECT 1 FROM updates u
             WHERE u.workspace_id = s.workspace_id AND u.guid = s.guid
           ) AS has_pending_updates
    FROM snapshots s
    WHERE s.workspace_id = $1 AND s.guid = $2
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs CAS source load failed", err))?;
  let Some((current_revision, has_pending_updates)) = current else {
    tx.rollback()
      .await
      .map_err(|err| RuntimeError::database("Doc blob refs CAS rollback failed", err))?;
    upsert_projection_state(
      pool,
      workspace_id,
      doc_id,
      None,
      "missing",
      Some("snapshot_missing"),
      None,
    )
    .await?;
    return Ok(ProjectionOutcome::Missing);
  };
  if current_revision != source_revision || has_pending_updates {
    tx.rollback()
      .await
      .map_err(|err| RuntimeError::database("Doc blob refs CAS rollback failed", err))?;
    upsert_projection_state(
      pool,
      workspace_id,
      doc_id,
      Some(source_revision),
      "pending",
      Some("source_changed"),
      None,
    )
    .await?;
    return Ok(ProjectionOutcome::Pending);
  }
  let projection = sqlx::query_as::<_, (i32, Option<DateTime<Utc>>)>(
    "SELECT parser_version, source_revision FROM doc_blob_ref_projections WHERE workspace_id = $1 AND doc_id = $2",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs projection CAS load failed", err))?;
  if projection.is_some_and(|(parser_version, projection_revision)| {
    parser_version > PARSER_VERSION || projection_revision.is_some_and(|revision| revision > source_revision)
  }) {
    tx.rollback()
      .await
      .map_err(|err| RuntimeError::database("Doc blob refs projection CAS rollback failed", err))?;
    upsert_projection_state(
      pool,
      workspace_id,
      doc_id,
      Some(source_revision),
      "pending",
      Some("projection_newer"),
      None,
    )
    .await?;
    return Ok(ProjectionOutcome::Pending);
  }

  let mut old_refs = sqlx::query_as::<_, (String, String, String)>(
    "SELECT blob_key, block_id, flavour FROM doc_blob_refs WHERE workspace_id = $1 AND doc_id = $2",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_all(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs shadow load failed", err))?;
  old_refs.sort();
  let mut new_refs = refs
    .iter()
    .map(|reference| {
      (
        reference.blob_key.clone(),
        reference.block_id.clone(),
        reference.flavour.clone(),
      )
    })
    .collect::<Vec<_>>();
  new_refs.sort();
  let shadow_mismatch = old_refs != new_refs;

  let deleted = sqlx::query("DELETE FROM doc_blob_refs WHERE workspace_id = $1 AND doc_id = $2")
    .bind(workspace_id)
    .bind(doc_id)
    .execute(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("Doc blob refs delete failed", err))?
    .rows_affected() as i64;
  let mut written = 0;
  for reference in refs {
    written += sqlx::query(
      r#"
      INSERT INTO doc_blob_refs
        (workspace_id, doc_id, blob_key, block_id, flavour, snapshot_updated_at, parser_version, status, error)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'fresh', NULL)
      ON CONFLICT (workspace_id, doc_id, blob_key, block_id) DO UPDATE
        SET flavour = EXCLUDED.flavour,
            snapshot_updated_at = EXCLUDED.snapshot_updated_at,
            indexed_at = CURRENT_TIMESTAMP,
            parser_version = EXCLUDED.parser_version,
            status = 'fresh',
            error = NULL
      "#,
    )
    .bind(workspace_id)
    .bind(doc_id)
    .bind(reference.blob_key)
    .bind(reference.block_id)
    .bind(reference.flavour)
    .bind(source_revision)
    .bind(PARSER_VERSION)
    .execute(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("Doc blob refs insert failed", err))?
    .rows_affected() as i64;
  }
  upsert_projection_state(
    &mut *tx,
    workspace_id,
    doc_id,
    Some(source_revision),
    "fresh",
    None,
    None,
  )
  .await?;
  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("Doc blob refs transaction commit failed", err))?;
  Ok(ProjectionOutcome::Fresh(ProjectionAttempt {
    written,
    deleted,
    shadow_mismatch,
  }))
}

async fn rebuild_doc_blob_refs_inner(
  runtime: &StorageRuntime,
  workspace_id: &str,
  doc_id: &str,
  expected_source_revision: Option<i64>,
) -> RuntimeResult<ProjectionStats> {
  let pool = runtime.pool().await?;
  let mut stats = ProjectionStats::default();
  stats.result.scanned_docs = 1;
  let Some(source) = load_doc_source(&pool, workspace_id, doc_id).await? else {
    upsert_projection_state(
      &pool,
      workspace_id,
      doc_id,
      None,
      "missing",
      Some("snapshot_missing"),
      None,
    )
    .await?;
    stats.result.failed_docs = 1;
    stats.missing_docs = 1;
    return Ok(stats);
  };
  if expected_source_revision.is_some_and(|revision| source.updated_at.timestamp_millis() != revision) {
    upsert_projection_state(
      &pool,
      workspace_id,
      doc_id,
      Some(source.updated_at),
      "pending",
      Some("source_changed"),
      None,
    )
    .await?;
    stats.pending_docs = 1;
    return Ok(stats);
  }
  if source.has_pending_updates {
    upsert_projection_state(
      &pool,
      workspace_id,
      doc_id,
      Some(source.updated_at),
      "pending",
      Some("pending_updates"),
      None,
    )
    .await?;
    stats.pending_docs = 1;
    return Ok(stats);
  }
  if projection_is_fresh(&pool, workspace_id, doc_id, source.updated_at).await? {
    return Ok(stats);
  }
  upsert_projection_state(
    &pool,
    workspace_id,
    doc_id,
    Some(source.updated_at),
    "running",
    None,
    None,
  )
  .await?;
  let Some(snapshot) = load_canonical_doc(&pool, workspace_id, doc_id).await? else {
    upsert_projection_state(
      &pool,
      workspace_id,
      doc_id,
      None,
      "missing",
      Some("snapshot_missing"),
      None,
    )
    .await?;
    stats.result.failed_docs = 1;
    stats.missing_docs = 1;
    return Ok(stats);
  };
  let CurrentDoc { blob, updated_at, .. } = snapshot;
  let refs = match extract_refs(blob) {
    Ok(refs) => refs,
    Err(_) => {
      upsert_projection_state(
        &pool,
        workspace_id,
        doc_id,
        Some(updated_at),
        "failed",
        Some("parse_failed"),
        Some("canonical snapshot parser rejected the document"),
      )
      .await?;
      stats.result.failed_docs = 1;
      return Ok(stats);
    }
  };
  match replace_doc_refs_if_current(&pool, workspace_id, doc_id, updated_at, refs).await? {
    ProjectionOutcome::Fresh(attempt) => {
      stats.result.parsed_docs = 1;
      stats.result.refs_written = attempt.written;
      stats.result.refs_deleted = attempt.deleted;
      stats.shadow_mismatches = i64::from(attempt.shadow_mismatch);
    }
    ProjectionOutcome::Pending => stats.pending_docs = 1,
    ProjectionOutcome::Missing => {
      stats.result.failed_docs = 1;
      stats.missing_docs = 1;
    }
  }
  Ok(stats)
}

#[cfg(test)]
mod tests {
  use chrono::Utc;
  use y_octo::Doc;

  use super::*;

  #[test]
  fn doc_blob_refs_projection_semantics() {
    let doc_id = "doc-blob-ref-test".to_string();
    let blob =
      doc_loader::build_full_doc("Doc", "![Alt](blob://image-blob-key)", &doc_id).expect("doc fixture should build");
    let snapshot = CurrentDoc {
      blob,
      updated_at: Utc::now(),
    };
    let refs = extract_refs(snapshot.blob).expect("refs should parse");
    assert!(
      refs
        .iter()
        .any(|reference| { reference.blob_key == "image-blob-key" && reference.flavour == "affine:image" })
    );

    let root = Doc::default();
    let mut meta = root.get_or_create_map("meta").expect("root meta should build");
    let mut pages = root.create_array().expect("root pages should build");
    let mut active = root.create_map().expect("active doc meta should build");
    active
      .insert("id".to_string(), "active-doc")
      .expect("active doc id should insert");
    pages.push(active).expect("active doc should insert");
    let mut trashed = root.create_map().expect("trashed doc meta should build");
    trashed
      .insert("id".to_string(), "trashed-doc")
      .expect("trashed doc id should insert");
    trashed
      .insert("trash".to_string(), true)
      .expect("trash flag should insert");
    pages.push(trashed).expect("trashed doc should insert");
    meta
      .insert("pages".to_string(), pages)
      .expect("root pages should insert");
    let root = root.encode_update_v1().expect("root doc should encode");
    let ids = doc_loader::get_doc_ids_from_binary(root, true).expect("root doc ids should parse");
    assert_eq!(ids, vec!["active-doc", "trashed-doc"]);
  }

  #[test]
  fn doc_blob_refs_rejects_corrupt_docs_without_a_failure_ref() {
    let snapshot = CurrentDoc {
      blob: vec![0xff],
      updated_at: Utc::now(),
    };
    assert!(extract_refs(snapshot.blob).is_err());
  }

  #[test]
  fn error_summary_is_bounded() {
    let error = "x".repeat(ERROR_SUMMARY_LIMIT + 20);
    assert_eq!(truncate_error_summary(&error).len(), ERROR_SUMMARY_LIMIT);
  }
}

#[napi_derive::napi]
impl StorageRuntime {
  #[napi]
  pub async fn rebuild_doc_blob_refs(
    &self,
    workspace_id: String,
    doc_id: String,
    source_revision: i64,
  ) -> napi::Result<RuntimeDocBlobRefsResult> {
    Ok(
      rebuild_doc_blob_refs_inner(self, &workspace_id, &doc_id, Some(source_revision))
        .await?
        .result,
    )
  }

  #[napi]
  pub async fn rebuild_workspace_doc_blob_refs(
    &self,
    workspace_id: String,
    limit: i64,
  ) -> napi::Result<RuntimeDocBlobRefsResult> {
    if limit <= 0 {
      return Err(napi_error("doc blob refs rebuild limit must be positive"));
    }
    let pool = self.pool().await?;
    let doc_ids = match load_workspace_doc_ids(&pool, &workspace_id).await {
      Ok(doc_ids) => doc_ids,
      Err(err) => {
        upsert_projection_failure_checkpoint(&pool, &workspace_id).await?;
        return Err(err.into());
      }
    };
    let state = load_projection_state(&pool, &workspace_id).await?;
    let current_doc_ids = doc_ids.clone();
    let doc_ids = doc_ids
      .into_iter()
      .filter(|doc_id| state.cursor.as_ref().is_none_or(|cursor| doc_id > cursor))
      .collect::<Vec<_>>();
    let has_more = doc_ids.len() > limit as usize;
    let mut total = ProjectionStats::default();
    total.result.failed_docs = state.failed_docs;
    let mut last_doc_id = None;
    for doc_id in doc_ids.into_iter().take(limit as usize) {
      last_doc_id = Some(doc_id.clone());
      let stats = rebuild_doc_blob_refs_inner(self, &workspace_id, &doc_id, None).await?;
      total.result.scanned_docs += stats.result.scanned_docs;
      total.result.parsed_docs += stats.result.parsed_docs;
      total.result.refs_written += stats.result.refs_written;
      total.result.refs_deleted += stats.result.refs_deleted;
      total.result.failed_docs += stats.result.failed_docs;
      total.pending_docs += stats.pending_docs;
      total.missing_docs += stats.missing_docs;
      total.shadow_mismatches += stats.shadow_mismatches;
    }
    if has_more {
      total.result.next_cursor = last_doc_id;
    } else if total.result.failed_docs == 0 && total.pending_docs == 0 {
      total.result.refs_deleted += purge_removed_doc_projections(&pool, &workspace_id, &current_doc_ids).await?;
    }
    upsert_projection_checkpoint(
      &pool,
      &workspace_id,
      &total.result,
      total.pending_docs,
      total.missing_docs,
      total.shadow_mismatches,
    )
    .await?;
    Ok(total.result)
  }
}
