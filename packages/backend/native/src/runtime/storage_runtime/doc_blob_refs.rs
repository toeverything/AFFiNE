use affine_doc_loader as doc_loader;
use chrono::{DateTime, Utc};
use sqlx::PgPool;

use super::{
  CurrentDoc, RuntimeDocBlobRefsResult, RuntimeError, RuntimeResult, StorageRuntime, load_current_doc,
  load_workspace_live_doc_ids, napi_error,
};

const PARSER_VERSION: i32 = 1;

type ExtractedRef = doc_loader::BlobRef;

#[derive(Default)]
struct ProjectionState {
  cursor: Option<String>,
  failed_docs: i64,
}

async fn load_workspace_doc_ids(pool: &PgPool, workspace_id: &str) -> RuntimeResult<Vec<String>> {
  let mut ids = load_workspace_live_doc_ids(pool, workspace_id).await?;
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

async fn upsert_projection_checkpoint(
  pool: &PgPool,
  workspace_id: &str,
  result: &RuntimeDocBlobRefsResult,
  failed_docs: i64,
) -> RuntimeResult<()> {
  let status = if result.next_cursor.is_some() {
    "running"
  } else if failed_docs > 0 {
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
    "failedDocs": failed_docs,
  }))
  .execute(pool)
  .await
  .map_err(|err| RuntimeError::database("Doc blob refs checkpoint write failed", err))?;
  Ok(())
}

async fn upsert_projection_failure_checkpoint(pool: &PgPool, workspace_id: &str, error: &str) -> RuntimeResult<()> {
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
    "error": error,
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
  if status != "running" && status != "failed" {
    return Ok(ProjectionState::default());
  }
  if metadata.get("parserVersion").and_then(serde_json::Value::as_i64) != Some(i64::from(PARSER_VERSION)) {
    return Ok(ProjectionState::default());
  }
  let cursor = cursor
    .get("lastDocId")
    .and_then(|value| value.as_str())
    .map(ToString::to_string);
  let Some(cursor) = cursor else {
    return Ok(ProjectionState::default());
  };
  let failed_docs = metadata
    .get("failedDocs")
    .and_then(serde_json::Value::as_i64)
    .unwrap_or(i64::from(status == "failed"));
  Ok(ProjectionState {
    cursor: Some(cursor),
    failed_docs,
  })
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

fn extract_refs(blob: Vec<u8>) -> RuntimeResult<Vec<ExtractedRef>> {
  doc_loader::get_blob_refs_from_binary(blob)
    .map_err(|err| RuntimeError::invalid_state(format!("Doc blob refs parse failed: {err}")))
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
      workspace_id: "workspace".to_string(),
      doc_id,
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
  fn doc_blob_refs_rejects_corrupt_docs() {
    let snapshot = CurrentDoc {
      workspace_id: "workspace".to_string(),
      doc_id: "corrupt".to_string(),
      blob: vec![0xff],
      updated_at: Utc::now(),
    };

    assert!(extract_refs(snapshot.blob).is_err());
  }
}

async fn replace_doc_refs(
  pool: &PgPool,
  workspace_id: &str,
  doc_id: &str,
  updated_at: DateTime<Utc>,
  refs: Vec<ExtractedRef>,
) -> RuntimeResult<(i64, i64)> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|err| RuntimeError::database("Doc blob refs transaction failed", err))?;

  let deleted = sqlx::query("DELETE FROM doc_blob_refs WHERE workspace_id = $1 AND doc_id = $2")
    .bind(workspace_id)
    .bind(doc_id)
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
    .bind(workspace_id)
    .bind(doc_id)
    .bind(reference.blob_key)
    .bind(reference.block_id)
    .bind(reference.flavour)
    .bind(updated_at)
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

  let CurrentDoc {
    workspace_id,
    doc_id,
    blob,
    updated_at,
  } = snapshot;
  match extract_refs(blob) {
    Ok(refs) => {
      let (written, deleted) = replace_doc_refs(&pool, &workspace_id, &doc_id, updated_at, refs).await?;
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
    let state = load_projection_state(&pool, &workspace_id).await?;
    let current_doc_ids = doc_ids.clone();
    let doc_ids = doc_ids
      .into_iter()
      .filter(|doc_id| state.cursor.as_ref().is_none_or(|cursor| doc_id > cursor))
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
    let failed_docs = state.failed_docs + total.failed_docs;
    if has_more {
      total.next_cursor = last_doc_id;
    } else if failed_docs == 0 {
      total.refs_deleted += purge_removed_doc_refs(&pool, &workspace_id, &current_doc_ids).await?;
    }

    upsert_projection_checkpoint(&pool, &workspace_id, &total, failed_docs).await?;

    Ok(total)
  }
}
