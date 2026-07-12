use affine_doc_loader as doc_loader;
use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use y_octo::Doc;

use super::{RuntimeDocBlobRefsResult, RuntimeError, RuntimeResult, StorageRuntime, napi_error};

const PARSER_VERSION: i32 = 1;

#[derive(FromRow)]
struct SnapshotRow {
  workspace_id: String,
  doc_id: String,
  blob: Vec<u8>,
  updated_at: DateTime<Utc>,
}

#[derive(FromRow)]
struct UpdateRow {
  blob: Vec<u8>,
  created_at: DateTime<Utc>,
}

struct ExtractedRef {
  blob_key: String,
  block_id: String,
  flavour: String,
}

async fn load_snapshot(pool: &PgPool, workspace_id: &str, doc_id: &str) -> RuntimeResult<Option<SnapshotRow>> {
  sqlx::query_as::<_, SnapshotRow>(
    r#"
    SELECT workspace_id, guid AS doc_id, blob, updated_at
    FROM snapshots
    WHERE workspace_id = $1 AND guid = $2
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(pool)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs load snapshot failed", err))
}

async fn load_updates(pool: &PgPool, workspace_id: &str, doc_id: &str) -> RuntimeResult<Vec<UpdateRow>> {
  sqlx::query_as::<_, UpdateRow>(
    r#"
    SELECT blob, created_at
    FROM updates
    WHERE workspace_id = $1 AND guid = $2
    ORDER BY created_at ASC
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_all(pool)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs load updates failed", err))
}

fn apply_doc_updates(updates: impl IntoIterator<Item = Vec<u8>>) -> RuntimeResult<Vec<u8>> {
  let mut doc = Doc::default();
  for update in updates {
    doc
      .apply_update_from_binary_v1(&update)
      .map_err(|err| RuntimeError::invalid_state(format!("Doc blob refs merge failed: {err}")))?;
  }
  doc
    .encode_update_v1()
    .map_err(|err| RuntimeError::invalid_state(format!("Doc blob refs encode failed: {err}")))
}

async fn load_current_doc(pool: &PgPool, workspace_id: &str, doc_id: &str) -> RuntimeResult<Option<SnapshotRow>> {
  let snapshot = load_snapshot(pool, workspace_id, doc_id).await?;
  let updates = load_updates(pool, workspace_id, doc_id).await?;
  if snapshot.is_none() && updates.is_empty() {
    return Ok(None);
  }

  let mut merge_inputs = Vec::with_capacity(updates.len() + usize::from(snapshot.is_some()));
  let mut updated_at = snapshot
    .as_ref()
    .map(|snapshot| snapshot.updated_at)
    .unwrap_or_else(Utc::now);
  if let Some(snapshot) = snapshot {
    merge_inputs.push(snapshot.blob);
  }
  for update in updates {
    updated_at = update.created_at;
    merge_inputs.push(update.blob);
  }

  Ok(Some(SnapshotRow {
    workspace_id: workspace_id.to_string(),
    doc_id: doc_id.to_string(),
    blob: apply_doc_updates(merge_inputs)?,
    updated_at,
  }))
}

async fn load_workspace_doc_ids(pool: &PgPool, workspace_id: &str) -> RuntimeResult<Vec<String>> {
  let Some(root) = load_current_doc(pool, workspace_id, workspace_id).await? else {
    return Ok(Vec::new());
  };
  let ids = doc_loader::get_doc_ids_from_binary(root.blob, false)
    .map_err(|err| RuntimeError::invalid_state(format!("Doc blob refs root doc parse failed: {err}")))?;
  let mut ids = ids;
  ids.sort();
  Ok(ids)
}

async fn upsert_projection_checkpoint(
  pool: &PgPool,
  workspace_id: &str,
  result: &RuntimeDocBlobRefsResult,
) -> RuntimeResult<()> {
  let completed = result.next_cursor.is_none();
  let status = if completed && result.failed_docs == 0 {
    "completed"
  } else if result.failed_docs > 0 {
    "failed"
  } else {
    "running"
  };
  sqlx::query(
    r#"
    INSERT INTO blob_reconciliation_checkpoints
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
  .bind(completed && result.failed_docs == 0)
  .bind(serde_json::json!({
    "parserVersion": PARSER_VERSION,
  }))
  .execute(pool)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs checkpoint write failed", err))?;
  Ok(())
}

async fn upsert_projection_failure_checkpoint(pool: &PgPool, workspace_id: &str, error: &str) -> RuntimeResult<()> {
  sqlx::query(
    r#"
    INSERT INTO blob_reconciliation_checkpoints
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
    "error": error,
  }))
  .execute(pool)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs failure checkpoint write failed", err))?;
  Ok(())
}

async fn load_projection_cursor(pool: &PgPool, workspace_id: &str) -> RuntimeResult<Option<String>> {
  let cursor = sqlx::query_scalar::<_, serde_json::Value>(
    "SELECT cursor FROM blob_reconciliation_checkpoints WHERE kind = 'doc_blob_refs' AND scope = $1",
  )
  .bind(workspace_id)
  .fetch_optional(pool)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs checkpoint load failed", err))?;
  Ok(cursor.and_then(|cursor| {
    cursor
      .get("lastDocId")
      .and_then(|value| value.as_str())
      .map(ToString::to_string)
  }))
}

async fn purge_removed_doc_refs(pool: &PgPool, workspace_id: &str, current_doc_ids: &[String]) -> RuntimeResult<i64> {
  let result = sqlx::query(
    r#"
    DELETE FROM doc_blob_refs
    WHERE workspace_id = $1
      AND NOT (doc_id = ANY($2))
    "#,
  )
  .bind(workspace_id)
  .bind(current_doc_ids)
  .execute(pool)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs purge removed docs failed", err))?;
  Ok(result.rows_affected() as i64)
}

fn extract_refs(snapshot: &SnapshotRow) -> RuntimeResult<Vec<ExtractedRef>> {
  let parsed = doc_loader::parse_doc_from_binary(snapshot.blob.clone(), snapshot.doc_id.clone())
    .map_err(|err| RuntimeError::invalid_state(format!("Doc blob refs parse failed: {err}")))?;
  let mut refs = Vec::new();
  for block in parsed.blocks {
    let Some(blob_keys) = block.blob else {
      continue;
    };
    for blob_key in blob_keys {
      refs.push(ExtractedRef {
        blob_key,
        block_id: block.block_id.clone(),
        flavour: block.flavour.clone(),
      });
    }
  }
  Ok(refs)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn doc_blob_refs_extracts_image_refs() {
    let doc_id = "doc-blob-ref-test".to_string();
    let blob =
      doc_loader::build_full_doc("Doc", "![Alt](blob://image-blob-key)", &doc_id).expect("doc fixture should build");
    let snapshot = SnapshotRow {
      workspace_id: "workspace".to_string(),
      doc_id,
      blob,
      updated_at: Utc::now(),
    };

    let refs = extract_refs(&snapshot).expect("refs should parse");

    assert!(
      refs
        .iter()
        .any(|reference| { reference.blob_key == "image-blob-key" && reference.flavour == "affine:image" })
    );
  }
}

async fn replace_doc_refs(pool: &PgPool, snapshot: &SnapshotRow, refs: Vec<ExtractedRef>) -> RuntimeResult<(i64, i64)> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|err| RuntimeError::database("Doc blob refs transaction failed", err))?;

  let deleted = sqlx::query("DELETE FROM doc_blob_refs WHERE workspace_id = $1 AND doc_id = $2")
    .bind(&snapshot.workspace_id)
    .bind(&snapshot.doc_id)
    .execute(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("Doc blob refs delete failed", err))?
    .rows_affected() as i64;

  let mut written = 0;
  for reference in refs {
    let affected = sqlx::query(
      r#"
      INSERT INTO doc_blob_refs
        (workspace_id, doc_id, blob_key, block_id, flavour, snapshot_updated_at, parser_version, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'fresh')
      ON CONFLICT (workspace_id, doc_id, blob_key, block_id) DO UPDATE
        SET flavour = EXCLUDED.flavour,
            snapshot_updated_at = EXCLUDED.snapshot_updated_at,
            indexed_at = CURRENT_TIMESTAMP,
            parser_version = EXCLUDED.parser_version,
            status = 'fresh',
            error = NULL
      "#,
    )
    .bind(&snapshot.workspace_id)
    .bind(&snapshot.doc_id)
    .bind(reference.blob_key)
    .bind(reference.block_id)
    .bind(reference.flavour)
    .bind(snapshot.updated_at)
    .bind(PARSER_VERSION)
    .execute(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("Doc blob refs insert failed", err))?
    .rows_affected() as i64;
    written += affected;
  }

  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("Doc blob refs transaction commit failed", err))?;
  Ok((written, deleted))
}

async fn mark_doc_failed(pool: &PgPool, workspace_id: &str, doc_id: &str, error: &str) -> RuntimeResult<()> {
  sqlx::query(
    r#"
    INSERT INTO doc_blob_refs
      (workspace_id, doc_id, blob_key, block_id, flavour, snapshot_updated_at, parser_version, status, error)
    VALUES ($1, $2, '__parse_failed__', '__parse_failed__', '__parse_failed__', CURRENT_TIMESTAMP, $3, 'failed', $4)
    ON CONFLICT (workspace_id, doc_id, blob_key, block_id) DO UPDATE
      SET indexed_at = CURRENT_TIMESTAMP,
          status = 'failed',
          error = EXCLUDED.error
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(PARSER_VERSION)
  .bind(error)
  .execute(pool)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs mark failure failed", err))?;
  Ok(())
}

async fn rebuild_doc_blob_refs_inner(
  runtime: &StorageRuntime,
  workspace_id: String,
  doc_id: String,
) -> RuntimeResult<RuntimeDocBlobRefsResult> {
  let pool = runtime.pool().await?;
  let mut result = RuntimeDocBlobRefsResult {
    scanned_docs: 1,
    parsed_docs: 0,
    refs_written: 0,
    refs_deleted: 0,
    failed_docs: 0,
    next_cursor: None,
  };

  let Some(snapshot) = load_current_doc(&pool, &workspace_id, &doc_id).await? else {
    result.failed_docs = 1;
    mark_doc_failed(&pool, &workspace_id, &doc_id, "snapshot_missing").await?;
    return Ok(result);
  };

  match extract_refs(&snapshot) {
    Ok(refs) => {
      let (written, deleted) = replace_doc_refs(&pool, &snapshot, refs).await?;
      result.parsed_docs = 1;
      result.refs_written = written;
      result.refs_deleted = deleted;
    }
    Err(err) => {
      result.failed_docs = 1;
      mark_doc_failed(&pool, &workspace_id, &doc_id, &err.to_string()).await?;
    }
  }

  Ok(result)
}

#[napi_derive::napi]
impl StorageRuntime {
  #[napi]
  pub async fn rebuild_doc_blob_refs(
    &self,
    workspace_id: String,
    doc_id: String,
  ) -> napi::Result<RuntimeDocBlobRefsResult> {
    Ok(rebuild_doc_blob_refs_inner(self, workspace_id, doc_id).await?)
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
        upsert_projection_failure_checkpoint(&pool, &workspace_id, &err.to_string()).await?;
        return Err(err.into());
      }
    };
    let cursor = load_projection_cursor(&pool, &workspace_id).await?;
    let current_doc_ids = doc_ids.clone();
    let doc_ids = doc_ids
      .into_iter()
      .filter(|doc_id| cursor.as_ref().is_none_or(|cursor| doc_id > cursor))
      .collect::<Vec<_>>();
    let has_more = doc_ids.len() > limit as usize;
    let mut total = RuntimeDocBlobRefsResult {
      scanned_docs: 0,
      parsed_docs: 0,
      refs_written: 0,
      refs_deleted: 0,
      failed_docs: 0,
      next_cursor: None,
    };

    let mut last_doc_id = None;
    for doc_id in doc_ids.into_iter().take(limit as usize) {
      last_doc_id = Some(doc_id.clone());
      let result = rebuild_doc_blob_refs_inner(self, workspace_id.clone(), doc_id).await?;
      total.scanned_docs += result.scanned_docs;
      total.parsed_docs += result.parsed_docs;
      total.refs_written += result.refs_written;
      total.refs_deleted += result.refs_deleted;
      total.failed_docs += result.failed_docs;
    }
    if has_more {
      total.next_cursor = last_doc_id;
    } else if total.failed_docs == 0 {
      total.refs_deleted += purge_removed_doc_refs(&pool, &workspace_id, &current_doc_ids).await?;
    }

    upsert_projection_checkpoint(&pool, &workspace_id, &total).await?;

    Ok(total)
  }
}
