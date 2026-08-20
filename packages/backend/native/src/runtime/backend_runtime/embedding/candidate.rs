use sqlx::{FromRow, PgPool};
use tokio::sync::watch;
use uuid::Uuid;

use super::{BackgroundEmbeddingProvider, RuntimeError, RuntimeResult};
use crate::runtime::types::{MatchEmbeddingCandidatesInput, RuntimeEmbeddingCandidate};

const EXACT_SCOPE_LIMIT: usize = 64;

#[derive(FromRow)]
struct CandidateRow {
  source_kind: String,
  source_key: String,
  content: String,
  distance: f64,
  doc_id: Option<String>,
  artifact_id: Option<Uuid>,
  unit_id: Option<String>,
  visibility: Option<String>,
  block_id: Option<String>,
  element_id: Option<String>,
  frame_id: Option<String>,
  chunk: i32,
}

pub(super) async fn match_candidates(
  pool: &PgPool,
  provider: &BackgroundEmbeddingProvider,
  input: &MatchEmbeddingCandidatesInput,
  abort: Option<&mut watch::Receiver<bool>>,
) -> RuntimeResult<Vec<RuntimeEmbeddingCandidate>> {
  validate(input)?;
  let required = required_ids(input);
  if input.retrieval.mode == "required" && required.is_empty() {
    return Ok(Vec::new());
  }
  if aborted(abort.as_deref()) {
    return Err(RuntimeError::invalid_state("embedding_search_aborted"));
  }
  let (index_id, fingerprint): (Uuid, String) = sqlx::query_as(
    r#"SELECT index_fact.id,index_fact.fingerprint FROM embedding_workspace_states state
    JOIN embedding_indexes index_fact ON index_fact.id=state.active_index_id
    WHERE state.workspace_id=$1 AND state.runtime_state='active' AND index_fact.health_status='ready'"#,
  )
  .bind(&input.workspace_id)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("load active embedding index failed", error))?
  .ok_or_else(|| RuntimeError::invalid_state("embedding_unavailable"))?;
  let vectors = provider
    .embed(
      &input.workspace_id,
      &fingerprint,
      vec![input.query.clone()],
      "RETRIEVAL_QUERY",
    )
    .await?;
  if aborted(abort.as_deref()) {
    return Err(RuntimeError::invalid_state("embedding_search_aborted"));
  }
  let vector = vectors
    .into_iter()
    .next()
    .filter(|vector| vector.len() == 1024)
    .ok_or_else(|| RuntimeError::invalid_state("embedding_query_vector_invalid"))?;
  let vector = vector_literal(&vector);
  let limit = i64::from(input.limit.unwrap_or(5).clamp(1, 20));
  let rows = if input.retrieval.mode == "required" {
    if required.len() <= EXACT_SCOPE_LIMIT {
      exact_candidates(pool, input, index_id, &required, &vector, limit).await?
    } else {
      large_required_candidates(pool, input, index_id, &required, &vector, limit).await?
    }
  } else {
    workspace_candidates(pool, input, index_id, &vector, limit).await?
  };
  Ok(rows.into_iter().map(Into::into).collect())
}

fn validate(input: &MatchEmbeddingCandidatesInput) -> RuntimeResult<()> {
  if !matches!(input.source_kind.as_str(), "document" | "artifact") {
    return Err(RuntimeError::invalid_input("embedding_source_kind_invalid"));
  }
  if !matches!(input.retrieval.mode.as_str(), "workspace" | "required") {
    return Err(RuntimeError::invalid_input("embedding_scope_mode_invalid"));
  }
  if input.query.trim().is_empty() || input.query.len() > 8_000 {
    return Err(RuntimeError::invalid_input("embedding_query_invalid"));
  }
  Ok(())
}

fn required_ids(input: &MatchEmbeddingCandidatesInput) -> Vec<String> {
  if input.source_kind == "document" {
    input.retrieval.required_doc_ids.clone()
  } else {
    input.retrieval.required_artifact_ids.clone()
  }
}

async fn exact_candidates(
  pool: &PgPool,
  input: &MatchEmbeddingCandidatesInput,
  index_id: Uuid,
  required: &[String],
  vector: &str,
  limit: i64,
) -> RuntimeResult<Vec<CandidateRow>> {
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("start exact embedding search failed", error))?;
  sqlx::query("SELECT set_config('enable_indexscan','off',true), set_config('enable_bitmapscan','off',true)")
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("configure exact embedding search failed", error))?;
  let rows = sqlx::query_as(
    r#"SELECT source.source_kind,source.source_key,chunk.content,
      (chunk.embedding <=> $5::vector)::float8 AS distance,chunk.doc_id,chunk.artifact_id,
      chunk.unit_id,chunk.visibility,chunk.block_id,chunk.element_id,chunk.frame_id,chunk.chunk_index AS chunk
    FROM embedding_chunks chunk
    JOIN embedding_sources source ON source.id=chunk.source_id
    JOIN embedding_projections projection ON projection.source_id=chunk.source_id
      AND projection.index_id=chunk.index_id
      AND projection.active_generation_token=chunk.generation_token
      AND projection.status='ready'
    WHERE chunk.workspace_id=$1 AND chunk.index_id=$2 AND chunk.source_kind=$3
      AND source.source_key=ANY($4::text[]) AND source.deleted_at IS NULL
    ORDER BY chunk.embedding <=> $5::vector,source.source_key,chunk.chunk_index LIMIT $6"#,
  )
  .bind(&input.workspace_id)
  .bind(index_id)
  .bind(&input.source_kind)
  .bind(required)
  .bind(vector)
  .bind(limit)
  .fetch_all(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("search exact embedding scope failed", error))?;
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit exact embedding search failed", error))?;
  Ok(rows)
}

async fn large_required_candidates(
  pool: &PgPool,
  input: &MatchEmbeddingCandidatesInput,
  index_id: Uuid,
  required: &[String],
  vector: &str,
  limit: i64,
) -> RuntimeResult<Vec<CandidateRow>> {
  sqlx::query_as(
    r#"SELECT source.source_kind,source.source_key,chunk.content,
      (chunk.embedding <=> $5::vector)::float8 AS distance,chunk.doc_id,chunk.artifact_id,
      chunk.unit_id,chunk.visibility,chunk.block_id,chunk.element_id,chunk.frame_id,chunk.chunk_index AS chunk
    FROM embedding_chunks chunk
    JOIN embedding_sources source ON source.id=chunk.source_id
    JOIN embedding_projections projection ON projection.source_id=chunk.source_id
      AND projection.index_id=chunk.index_id
      AND projection.active_generation_token=chunk.generation_token
      AND projection.status='ready'
    WHERE chunk.workspace_id=$1 AND chunk.index_id=$2 AND chunk.source_kind=$3
      AND source.source_key=ANY($4::text[]) AND source.deleted_at IS NULL
    ORDER BY chunk.embedding <=> $5::vector,source.source_key,chunk.chunk_index LIMIT $6"#,
  )
  .bind(&input.workspace_id)
  .bind(index_id)
  .bind(&input.source_kind)
  .bind(required)
  .bind(vector)
  .bind(limit)
  .fetch_all(pool)
  .await
  .map_err(|error| RuntimeError::database("search large required embedding scope failed", error))
}

async fn workspace_candidates(
  pool: &PgPool,
  input: &MatchEmbeddingCandidatesInput,
  index_id: Uuid,
  vector: &str,
  limit: i64,
) -> RuntimeResult<Vec<CandidateRow>> {
  sqlx::query_as(
    r#"SELECT source.source_kind,source.source_key,chunk.content,
      (chunk.embedding <=> $4::vector)::float8 AS distance,chunk.doc_id,chunk.artifact_id,
      chunk.unit_id,chunk.visibility,chunk.block_id,chunk.element_id,chunk.frame_id,chunk.chunk_index AS chunk
    FROM embedding_chunks chunk
    JOIN embedding_sources source ON source.id=chunk.source_id
    JOIN embedding_projections projection ON projection.source_id=chunk.source_id
      AND projection.index_id=chunk.index_id
      AND projection.active_generation_token=chunk.generation_token
      AND projection.status='ready'
    WHERE chunk.workspace_id=$1 AND chunk.index_id=$2 AND chunk.source_kind=$3 AND source.deleted_at IS NULL
      AND ($3<>'artifact' OR EXISTS(
        SELECT 1 FROM workspace_artifacts artifact
        WHERE artifact.workspace_id=chunk.workspace_id AND artifact.id=chunk.artifact_id
          AND artifact.status='ready' AND artifact.library_owned
      ))
    ORDER BY (source.source_key=ANY($5::text[])) DESC,chunk.embedding <=> $4::vector,
      source.source_key,chunk.chunk_index LIMIT $6"#,
  )
  .bind(&input.workspace_id)
  .bind(index_id)
  .bind(&input.source_kind)
  .bind(vector)
  .bind(&input.retrieval.preferred_source_ids)
  .bind(limit)
  .fetch_all(pool)
  .await
  .map_err(|error| RuntimeError::database("search workspace embedding corpus failed", error))
}

fn aborted(receiver: Option<&watch::Receiver<bool>>) -> bool {
  receiver.is_some_and(|receiver| *receiver.borrow())
}

fn vector_literal(vector: &[f32]) -> String {
  format!(
    "[{}]",
    vector.iter().map(ToString::to_string).collect::<Vec<_>>().join(",")
  )
}

impl From<CandidateRow> for RuntimeEmbeddingCandidate {
  fn from(row: CandidateRow) -> Self {
    Self {
      source_kind: row.source_kind,
      source_key: row.source_key,
      content: row.content,
      distance: row.distance,
      doc_id: row.doc_id,
      artifact_id: row.artifact_id.map(|id| id.to_string()),
      unit_id: row.unit_id,
      visibility: row.visibility,
      block_id: row.block_id,
      element_id: row.element_id,
      frame_id: row.frame_id,
      chunk: row.chunk,
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::runtime::types::RuntimeRetrievalScope;

  fn input(kind: &str, mode: &str) -> MatchEmbeddingCandidatesInput {
    MatchEmbeddingCandidatesInput {
      request_id: None,
      workspace_id: "workspace".to_string(),
      query: "query".to_string(),
      source_kind: kind.to_string(),
      retrieval: RuntimeRetrievalScope {
        mode: mode.to_string(),
        required_doc_ids: Vec::new(),
        required_artifact_ids: Vec::new(),
        preferred_source_ids: Vec::new(),
      },
      limit: None,
    }
  }

  #[test]
  fn candidate_contract_is_closed() {
    assert!(validate(&input("document", "workspace")).is_ok());
    assert!(validate(&input("artifact", "required")).is_ok());
    assert!(validate(&input("unknown", "workspace")).is_err());
    assert!(validate(&input("document", "fallback")).is_err());
  }
}
