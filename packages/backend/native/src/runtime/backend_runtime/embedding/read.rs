use std::{sync::Arc, time::Duration};

use doc_extractor::Doc;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use super::{RuntimeError, RuntimeResult, extraction_file_name};
use crate::runtime::{
  object_storage::{
    ObjectStorageService,
    types::{ObjectKey, ObjectLocator, StorageScope},
  },
  types::{ReadEmbeddingSourceContentInput, RuntimeEmbeddingSourceContent},
};

const MAX_INPUT_BYTES: usize = 50 * 1024 * 1024;

#[derive(FromRow)]
struct SourceRow {
  content_revision: String,
  storage_scope: Option<String>,
  storage_key: Option<String>,
  file_name: Option<String>,
  mime_type: Option<String>,
  active_generation_token: Option<Uuid>,
}

pub(super) async fn read_source_content(
  pool: &PgPool,
  storage: Arc<ObjectStorageService>,
  input: &ReadEmbeddingSourceContentInput,
) -> RuntimeResult<RuntimeEmbeddingSourceContent> {
  authorize_scope(input)?;
  let source = sqlx::query_as::<_, SourceRow>(
    r#"SELECT source.content_revision,source.storage_scope,source.storage_key,
      source.file_name,source.mime_type,projection.active_generation_token
    FROM embedding_sources source
    LEFT JOIN embedding_workspace_states state ON state.workspace_id=source.workspace_id
    LEFT JOIN embedding_projections projection ON projection.source_id=source.id
      AND projection.index_id=state.active_index_id AND projection.status='ready'
    WHERE source.workspace_id=$1 AND source.source_kind=$2 AND source.source_key=$3
      AND source.deleted_at IS NULL
      AND ($4<>'workspace' OR $2<>'artifact' OR EXISTS(
        SELECT 1 FROM workspace_artifacts artifact
        WHERE artifact.workspace_id=source.workspace_id AND artifact.id::text=source.source_key
          AND artifact.status='ready' AND artifact.library_owned
      ))"#,
  )
  .bind(&input.workspace_id)
  .bind(&input.source_kind)
  .bind(&input.source_key)
  .bind(&input.retrieval.mode)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("load embedding source content failed", error))?
  .ok_or_else(|| RuntimeError::invalid_input("embedding_source_not_found"))?;
  let chunks = if let Some(token) = source.active_generation_token {
    sqlx::query_scalar::<_, String>(
      "SELECT content FROM embedding_chunks WHERE generation_token=$1 ORDER BY chunk_index",
    )
    .bind(token)
    .fetch_all(pool)
    .await
    .map_err(|error| RuntimeError::database("load materialized embedding content failed", error))?
  } else if input.source_kind == "artifact" {
    extract_artifact(storage, &source).await?
  } else {
    return Err(RuntimeError::invalid_state("embedding_source_unavailable"));
  };
  let start = input
    .cursor
    .as_deref()
    .unwrap_or("0")
    .parse::<usize>()
    .map_err(|_| RuntimeError::invalid_input("embedding_content_cursor_invalid"))?;
  let max_chars = input.max_chars.unwrap_or(20_000).clamp(1, 100_000) as usize;
  let mut content = String::new();
  let mut next = start;
  while let Some(chunk) = chunks.get(next) {
    let separator = usize::from(!content.is_empty());
    if !content.is_empty() {
      content.push('\n');
    }
    let remaining = max_chars.saturating_sub(content.len());
    if chunk.len() > remaining {
      content.truncate(content.len().saturating_sub(separator));
      break;
    }
    content.push_str(chunk);
    next += 1;
  }
  let truncated = next < chunks.len();
  Ok(RuntimeEmbeddingSourceContent {
    content,
    revision: source.content_revision,
    mime_type: source.mime_type,
    name: source.file_name,
    truncated,
    next_cursor: truncated.then(|| next.to_string()),
  })
}

fn authorize_scope(input: &ReadEmbeddingSourceContentInput) -> RuntimeResult<()> {
  if !matches!(input.source_kind.as_str(), "document" | "artifact") {
    return Err(RuntimeError::invalid_input("embedding_source_kind_invalid"));
  }
  if input.retrieval.mode == "workspace" {
    return Ok(());
  }
  if input.retrieval.mode != "required" {
    return Err(RuntimeError::invalid_input("embedding_scope_mode_invalid"));
  }
  let allowed = if input.source_kind == "document" {
    input.retrieval.required_doc_ids.contains(&input.source_key)
  } else {
    input.retrieval.required_artifact_ids.contains(&input.source_key)
  };
  if !allowed {
    return Err(RuntimeError::invalid_input("embedding_source_out_of_scope"));
  }
  Ok(())
}

async fn extract_artifact(storage: Arc<ObjectStorageService>, source: &SourceRow) -> RuntimeResult<Vec<String>> {
  let scope = source
    .storage_scope
    .as_deref()
    .ok_or_else(|| RuntimeError::invalid_state("artifact_locator_missing"))?;
  let key = source
    .storage_key
    .as_deref()
    .ok_or_else(|| RuntimeError::invalid_state("artifact_locator_missing"))?;
  let locator = ObjectLocator::new(StorageScope::parse(scope)?, ObjectKey::new(key)?);
  let object = storage
    .get_limited(&locator, MAX_INPUT_BYTES)
    .await?
    .ok_or_else(|| RuntimeError::invalid_state("artifact_object_missing"))?;
  let file_name = source
    .file_name
    .clone()
    .or_else(|| source.mime_type.as_deref().map(extraction_file_name))
    .unwrap_or_else(|| "artifact".to_string());
  let body = object.body;
  let parsed = tokio::time::timeout(
    Duration::from_secs(120),
    tokio::task::spawn_blocking(move || Doc::new(&file_name, &body)),
  )
  .await
  .map_err(|_| RuntimeError::invalid_state("artifact_extraction_timeout"))?
  .map_err(|_| RuntimeError::invalid_state("artifact_extraction_failed"))?
  .map_err(|_| RuntimeError::invalid_input("artifact_format_unsupported"))?;
  Ok(
    parsed
      .chunks
      .into_iter()
      .map(|chunk| crate::utils::clean_content(&chunk.content))
      .filter(|content| !content.trim().is_empty())
      .collect(),
  )
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::runtime::types::RuntimeRetrievalScope;

  fn input(mode: &str, required: Vec<String>) -> ReadEmbeddingSourceContentInput {
    ReadEmbeddingSourceContentInput {
      workspace_id: "workspace".to_string(),
      source_kind: "artifact".to_string(),
      source_key: "artifact".to_string(),
      retrieval: RuntimeRetrievalScope {
        mode: mode.to_string(),
        required_doc_ids: Vec::new(),
        required_artifact_ids: required,
        preferred_source_ids: Vec::new(),
      },
      max_chars: None,
      cursor: None,
    }
  }

  #[test]
  fn exact_read_cannot_expand_required_scope() {
    assert!(authorize_scope(&input("required", vec!["artifact".to_string()])).is_ok());
    assert!(authorize_scope(&input("required", Vec::new())).is_err());
    assert!(authorize_scope(&input("workspace", Vec::new())).is_ok());
  }
}
