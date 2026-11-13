use affine_doc_loader as doc_loader;
use chrono::{DateTime, Utc};
use sqlx::{Executor, PgConnection, Postgres};

use super::{
  CurrentDoc, CurrentDocUpdate, RuntimeDocBlobRefsResult, RuntimeError, RuntimeResult, StorageOperation,
  StorageRuntime, load_workspace_doc_states_in, merge_current_doc, napi_error,
};

pub(super) const PARSER_VERSION: i32 = 3;
const ERROR_SUMMARY_LIMIT: usize = 512;

type ExtractedRef = doc_loader::BlobRef;

#[derive(Default)]
struct ProjectionState {
  cursor: Option<String>,
  failed_docs: i64,
}

#[derive(Default)]
struct ProjectionStats {
  result: RuntimeDocBlobRefsResult,
  pending_docs: i64,
}

pub(super) async fn retained_doc_ids(connection: &mut PgConnection, workspace_id: &str) -> RuntimeResult<Vec<String>> {
  let mut ids = load_workspace_doc_states_in(connection, workspace_id)
    .await?
    .into_iter()
    .map(|state| state.doc_id)
    .collect::<Vec<_>>();
  ids.extend(
    sqlx::query_scalar::<_, String>(
      "SELECT DISTINCT guid FROM snapshot_histories WHERE workspace_id=$1 AND expired_at > CURRENT_TIMESTAMP ORDER BY \
       guid",
    )
    .bind(workspace_id)
    .fetch_all(connection)
    .await
    .map_err(|error| RuntimeError::database("load retained history identities", error))?,
  );
  ids.sort();
  ids.dedup();
  Ok(ids)
}

pub(super) const DOC_BLOB_SOURCES_SQL: &str = r#"
  SELECT guid AS doc_id,blob,updated_at AS timestamp,'snapshot'::text AS kind,
         NULL::timestamptz AS expired_at,encode(sha256(blob),'hex') AS digest
  FROM snapshots WHERE workspace_id=$1 AND ($2::text IS NULL OR guid=$2)
  UNION ALL
  SELECT guid,blob,created_at,'update',NULL::timestamptz,encode(sha256(blob),'hex')
  FROM updates WHERE workspace_id=$1 AND ($2::text IS NULL OR guid=$2)
  UNION ALL
  SELECT guid,blob,timestamp,'history',expired_at,encode(sha256(blob),'hex')
  FROM snapshot_histories
  WHERE workspace_id=$1 AND ($2::text IS NULL OR guid=$2) AND expired_at>CURRENT_TIMESTAMP
"#;
pub(super) const SOURCE_FINGERPRINT_SQL: &str = r#"
  encode(sha256(convert_to(COALESCE(string_agg(
    jsonb_build_array(kind,extract(epoch from timestamp),extract(epoch from expired_at),digest)::text,
    ',' ORDER BY kind,timestamp,digest
  ),''),'UTF8')),'hex')
"#;

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
  source_fingerprint: &str,
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
      (workspace_id, doc_id, source_revision, parser_version, status, indexed_at, error_code, error_summary, source_fingerprint, attempt_count)
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7, $8, CASE WHEN $5 = 'fresh' THEN 0 ELSE 1 END)
    ON CONFLICT (workspace_id, doc_id) DO UPDATE
      SET source_revision = EXCLUDED.source_revision,
          source_fingerprint = EXCLUDED.source_fingerprint,
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
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(source_revision)
  .bind(PARSER_VERSION)
  .bind(status)
  .bind(error_code)
  .bind(error_summary.map(truncate_error_summary))
  .bind(source_fingerprint)
  .execute(executor)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs projection state write failed", err))?;
  Ok(())
}

async fn upsert_projection_checkpoint(
  connection: &mut PgConnection,
  workspace_id: &str,
  result: &RuntimeDocBlobRefsResult,
  pending_docs: i64,
) -> RuntimeResult<()> {
  let status = if result.next_cursor.is_some() {
    "running"
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
  }))
  .execute(&mut *connection)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs checkpoint write failed", err))?;
  Ok(())
}

async fn load_projection_state(connection: &mut PgConnection, workspace_id: &str) -> RuntimeResult<ProjectionState> {
  let checkpoint = sqlx::query_as::<_, (String, serde_json::Value, serde_json::Value)>(
    "SELECT status, cursor, metadata FROM storage_reconciliation_checkpoints WHERE kind = 'doc_blob_refs' AND scope = \
     $1",
  )
  .bind(workspace_id)
  .fetch_optional(&mut *connection)
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

pub(super) async fn purge_removed_doc_projections(
  connection: &mut PgConnection,
  workspace_id: &str,
  current_doc_ids: &[String],
) -> RuntimeResult<i64> {
  sqlx::query_scalar(
    "WITH refs AS (DELETE FROM doc_blob_refs WHERE workspace_id=$1 AND NOT (doc_id=ANY($2)) RETURNING 1), projections \
     AS (DELETE FROM doc_blob_ref_projections WHERE workspace_id=$1 AND NOT (doc_id=ANY($2))) SELECT count(*)::bigint \
     FROM refs",
  )
  .bind(workspace_id)
  .bind(current_doc_ids)
  .fetch_one(connection)
  .await
  .map_err(|error| RuntimeError::database("purge removed document projections", error))
}

pub(super) async fn replace_doc_refs(
  connection: &mut PgConnection,
  workspace_id: &str,
  doc_id: &str,
  source_revision: DateTime<Utc>,
  source_fingerprint: &str,
  refs: Vec<ExtractedRef>,
) -> RuntimeResult<Option<(i64, i64)>> {
  use sqlx::Connection;
  let mut tx = connection
    .begin()
    .await
    .map_err(|err| RuntimeError::database("begin blob ref projection", err))?;
  let fingerprint_query =
    format!("WITH sources AS ({DOC_BLOB_SOURCES_SQL}) SELECT {SOURCE_FINGERPRINT_SQL} FROM sources");
  let current_fingerprint: String = sqlx::query_scalar(&fingerprint_query)
    .bind(workspace_id)
    .bind(doc_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("check blob projection source fingerprint", error))?;
  if current_fingerprint != source_fingerprint {
    return Ok(None);
  }
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
    source_fingerprint,
    "fresh",
    None,
    None,
  )
  .await?;
  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("Doc blob refs transaction commit failed", err))?;
  Ok(Some((written, deleted)))
}

async fn rebuild_doc_blob_refs_inner(
  connection: &mut PgConnection,
  workspace_id: &str,
  doc_id: &str,
  expected_source_revision: Option<i64>,
) -> RuntimeResult<ProjectionStats> {
  let mut stats = ProjectionStats::default();
  stats.result.scanned_docs = 1;
  let source_query = format!(
    "WITH sources AS ({DOC_BLOB_SOURCES_SQL}), fingerprint AS (SELECT {SOURCE_FINGERPRINT_SQL} AS stamp FROM sources) \
     SELECT blob,timestamp,kind,stamp FROM sources CROSS JOIN fingerprint ORDER BY kind,timestamp,digest"
  );
  let rows = sqlx::query_as::<_, (Vec<u8>, DateTime<Utc>, String, String)>(&source_query)
    .bind(workspace_id)
    .bind(doc_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| RuntimeError::database("load blob projection sources", error))?;
  let Some((_, _, _, source_fingerprint)) = rows.first() else {
    return Ok(stats);
  };
  let source_fingerprint = source_fingerprint.clone();
  let revision = rows.iter().map(|(_, timestamp, _, _)| *timestamp).max();
  let mut snapshot = None;
  let mut updates = Vec::new();
  let mut histories = Vec::new();
  for (blob, timestamp, kind, _) in rows {
    match kind.as_str() {
      "snapshot" => {
        snapshot = Some(CurrentDoc {
          blob,
          updated_at: timestamp,
          updated_by: None,
        })
      }
      "update" => updates.push(CurrentDocUpdate {
        blob,
        created_at: timestamp,
        created_by: None,
      }),
      _ => histories.push(blob),
    }
  }
  let current = merge_current_doc(snapshot, updates)?;
  let Some(revision) = revision else {
    return Ok(stats);
  };
  if expected_source_revision.is_some_and(|expected| {
    current
      .as_ref()
      .is_none_or(|doc| doc.updated_at.timestamp_millis() != expected)
  }) {
    stats.pending_docs = 1;
    return Ok(stats);
  }
  let mut refs = Vec::new();
  for blob in current.into_iter().map(|doc| doc.blob).chain(histories) {
    match super::extract_blob_refs(blob) {
      Ok(extracted) => refs.extend(extracted),
      Err(error) => {
        let code = super::blob_ref_projection_error_code(error);
        upsert_projection_state(
          &mut *connection,
          workspace_id,
          doc_id,
          Some(revision),
          &source_fingerprint,
          "failed",
          Some(code),
          Some(code),
        )
        .await?;
        stats.result.failed_docs = 1;
        return Ok(stats);
      }
    }
  }
  refs.sort_by(|left, right| {
    (&left.blob_key, &left.block_id, &left.flavour).cmp(&(&right.blob_key, &right.block_id, &right.flavour))
  });
  refs.dedup_by(|left, right| left.blob_key == right.blob_key && left.block_id == right.block_id);
  let Some((written, deleted)) =
    replace_doc_refs(connection, workspace_id, doc_id, revision, &source_fingerprint, refs).await?
  else {
    stats.pending_docs = 1;
    return Ok(stats);
  };
  stats.result.parsed_docs = 1;
  stats.result.refs_written = written;
  stats.result.refs_deleted = deleted;
  Ok(stats)
}

#[cfg(test)]
mod tests {
  use super::*;

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
    let pool = self.pool().await?;
    let mut operation = StorageOperation::acquire_shared(&pool, &workspace_id).await?;
    let result =
      rebuild_doc_blob_refs_inner(operation.connection(), &workspace_id, &doc_id, Some(source_revision)).await;
    operation.release().await?;
    Ok(result?.result)
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
    let mut operation = StorageOperation::acquire_shared(&pool, &workspace_id).await?;
    let doc_ids = retained_doc_ids(operation.connection(), &workspace_id).await?;
    let state = load_projection_state(operation.connection(), &workspace_id).await?;
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
      let stats = rebuild_doc_blob_refs_inner(operation.connection(), &workspace_id, &doc_id, None).await?;
      total.result.scanned_docs += stats.result.scanned_docs;
      total.result.parsed_docs += stats.result.parsed_docs;
      total.result.refs_written += stats.result.refs_written;
      total.result.refs_deleted += stats.result.refs_deleted;
      total.result.failed_docs += stats.result.failed_docs;
      total.pending_docs += stats.pending_docs;
    }
    if has_more {
      total.result.next_cursor = last_doc_id;
    } else if total.result.failed_docs == 0 && total.pending_docs == 0 {
      total.result.refs_deleted +=
        purge_removed_doc_projections(operation.connection(), &workspace_id, &current_doc_ids).await?;
    }
    upsert_projection_checkpoint(operation.connection(), &workspace_id, &total.result, total.pending_docs).await?;
    operation.release().await?;
    Ok(total.result)
  }
}
