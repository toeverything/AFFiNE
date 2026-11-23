use sqlx::{FromRow, PgPool};
use tokio::sync::watch;
use uuid::Uuid;

use super::{BackgroundEmbeddingProvider, RuntimeError, RuntimeResult, legacy_document_ids};
use crate::runtime::{
  embedding_storage::storage_vector_type,
  types::{MatchEmbeddingCandidatesInput, RuntimeEmbeddingCandidate},
};

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
  dimensions: u32,
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
  let allowed = if input.source_kind == "document" {
    legacy_document_ids(pool, &input.workspace_id).await?
  } else {
    None
  };
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
    .filter(|vector| vector.len() == dimensions as usize)
    .ok_or_else(|| RuntimeError::invalid_state("embedding_query_vector_invalid"))?;
  let vector = vector_literal(&vector);
  let limit = i64::from(input.limit.unwrap_or(5).clamp(1, 20));
  let rows = if input.retrieval.mode == "required" {
    if required.len() <= EXACT_SCOPE_LIMIT {
      exact_candidates(pool, input, index_id, &vector, limit, dimensions, allowed.as_deref()).await?
    } else {
      large_required_candidates(pool, input, index_id, &vector, limit, dimensions, allowed.as_deref()).await?
    }
  } else {
    workspace_candidates(pool, input, index_id, &vector, limit, dimensions, allowed.as_deref()).await?
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
  vector: &str,
  limit: i64,
  dimensions: u32,
  allowed: Option<&[String]>,
) -> RuntimeResult<Vec<CandidateRow>> {
  let required = required_ids(input);
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("start exact embedding search failed", error))?;
  sqlx::query("SELECT set_config('enable_indexscan','off',true), set_config('enable_bitmapscan','off',true)")
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("configure exact embedding search failed", error))?;
  let rows = sqlx::query_as(&format!(
    r#"SELECT source.source_kind,source.source_key,chunk.content,
      (chunk.embedding <=> $5::{vector_type})::float8 AS distance,chunk.doc_id,chunk.artifact_id,
      chunk.unit_id,chunk.visibility,chunk.block_id,chunk.element_id,chunk.frame_id,chunk.chunk_index AS chunk
    FROM embedding_chunks chunk
    JOIN embedding_sources source ON source.id=chunk.source_id
    JOIN embedding_projections projection ON projection.source_id=chunk.source_id
      AND projection.index_id=chunk.index_id
      AND projection.active_generation_token=chunk.generation_token
      AND projection.status='ready'
    WHERE chunk.workspace_id=$1 AND chunk.index_id=$2 AND chunk.source_kind=$3
      AND source.source_key=ANY($4::text[]) AND source.deleted_at IS NULL
      AND ($7::text[] IS NULL OR source.source_key=ANY($7::text[]))
    ORDER BY chunk.embedding <=> $5::{vector_type},source.source_key,chunk.chunk_index LIMIT $6"#,
    vector_type = storage_vector_type(dimensions),
  ))
  .bind(&input.workspace_id)
  .bind(index_id)
  .bind(&input.source_kind)
  .bind(required.as_slice())
  .bind(vector)
  .bind(limit)
  .bind(allowed)
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
  vector: &str,
  limit: i64,
  dimensions: u32,
  allowed: Option<&[String]>,
) -> RuntimeResult<Vec<CandidateRow>> {
  let required = required_ids(input);
  sqlx::query_as(&format!(
    r#"SELECT source.source_kind,source.source_key,chunk.content,
      (chunk.embedding <=> $5::{vector_type})::float8 AS distance,chunk.doc_id,chunk.artifact_id,
      chunk.unit_id,chunk.visibility,chunk.block_id,chunk.element_id,chunk.frame_id,chunk.chunk_index AS chunk
    FROM embedding_chunks chunk
    JOIN embedding_sources source ON source.id=chunk.source_id
    JOIN embedding_projections projection ON projection.source_id=chunk.source_id
      AND projection.index_id=chunk.index_id
      AND projection.active_generation_token=chunk.generation_token
      AND projection.status='ready'
    WHERE chunk.workspace_id=$1 AND chunk.index_id=$2 AND chunk.source_kind=$3
      AND source.source_key=ANY($4::text[]) AND source.deleted_at IS NULL
      AND ($7::text[] IS NULL OR source.source_key=ANY($7::text[]))
    ORDER BY chunk.embedding <=> $5::{vector_type},source.source_key,chunk.chunk_index LIMIT $6"#,
    vector_type = storage_vector_type(dimensions),
  ))
  .bind(&input.workspace_id)
  .bind(index_id)
  .bind(&input.source_kind)
  .bind(required.as_slice())
  .bind(vector)
  .bind(limit)
  .bind(allowed)
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
  dimensions: u32,
  allowed: Option<&[String]>,
) -> RuntimeResult<Vec<CandidateRow>> {
  sqlx::query_as(&format!(
    r#"SELECT source.source_kind,source.source_key,chunk.content,
      (chunk.embedding <=> $4::{vector_type})::float8 AS distance,chunk.doc_id,chunk.artifact_id,
      chunk.unit_id,chunk.visibility,chunk.block_id,chunk.element_id,chunk.frame_id,chunk.chunk_index AS chunk
    FROM embedding_chunks chunk
    JOIN embedding_sources source ON source.id=chunk.source_id
    JOIN embedding_projections projection ON projection.source_id=chunk.source_id
      AND projection.index_id=chunk.index_id
      AND projection.active_generation_token=chunk.generation_token
      AND projection.status='ready'
    WHERE chunk.workspace_id=$1 AND chunk.index_id=$2 AND chunk.source_kind=$3 AND source.deleted_at IS NULL
      AND ($7::text[] IS NULL OR source.source_key=ANY($7::text[]))
      AND ($3<>'artifact' OR EXISTS(
        SELECT 1 FROM workspace_artifacts artifact
        WHERE artifact.workspace_id=chunk.workspace_id AND artifact.id=chunk.artifact_id
          AND artifact.status='ready' AND artifact.library_owned
      ))
    ORDER BY (source.source_key=ANY($5::text[])) DESC,chunk.embedding <=> $4::{vector_type},
      source.source_key,chunk.chunk_index LIMIT $6"#,
    vector_type = storage_vector_type(dimensions),
  ))
  .bind(&input.workspace_id)
  .bind(index_id)
  .bind(&input.source_kind)
  .bind(vector)
  .bind(&input.retrieval.preferred_source_ids)
  .bind(limit)
  .bind(allowed)
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

  #[tokio::test]
  async fn candidate_contract_is_closed() {
    assert!(validate(&input("document", "workspace")).is_ok());
    assert!(validate(&input("artifact", "required")).is_ok());
    assert!(validate(&input("unknown", "workspace")).is_err());
    assert!(validate(&input("document", "fallback")).is_err());
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
    let pool = PgPool::connect(&database_url).await.unwrap();
    let dims = crate::runtime::EmbeddingRuntimeConfig::default().dimensions;
    assert!(
      crate::runtime::migrations::migrate_embedding_tables(&pool, dims)
        .await
        .enabled
    );
    sqlx::query(
      "DELETE FROM storage_reconciliation_checkpoints WHERE kind='workspace_doc_lifecycle_activation' AND \
       scope='global'",
    )
    .execute(&pool)
    .await
    .unwrap();
    let workspace_id = format!("candidate-membership-{}", Uuid::new_v4());
    let index_id = Uuid::new_v4();
    sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO \
       embedding_indexes(id,workspace_id,fingerprint,route_source,provider,model_id,endpoint_fingerprint,\
       contract_version,health_status) VALUES($1,$2,'membership','byok','openai','model','endpoint',1,'ready')",
    )
    .bind(index_id)
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO embedding_workspace_states(workspace_id,active_index_id,runtime_state) VALUES($1,$2,'active')",
    )
    .bind(&workspace_id)
    .bind(index_id)
    .execute(&pool)
    .await
    .unwrap();
    let root = affine_doc_loader::add_doc_to_root_doc(Vec::new(), "visible", None).unwrap();
    sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$1,$2,now())")
      .bind(&workspace_id)
      .bind(root)
      .execute(&pool)
      .await
      .unwrap();
    let vector = vector_literal(&vec![1.0; 1024]);
    for (doc_id, embedding) in [
      ("hidden", vec![1.0; 1024]),
      (
        "visible",
        (0..1024).map(|i| if i % 2 == 0 { 1.0 } else { 0.0 }).collect(),
      ),
    ] {
      let source_id = Uuid::new_v4();
      let token = Uuid::new_v4();
      sqlx::query(
        "INSERT INTO \
         embedding_sources(id,workspace_id,source_kind,source_key,content_revision,descriptor_revision,\
         recipe_revision,document_projection) VALUES($1,$2,'document',$3,'1','descriptor','recipe','{}')",
      )
      .bind(source_id)
      .bind(&workspace_id)
      .bind(doc_id)
      .execute(&pool)
      .await
      .unwrap();
      sqlx::query(
        "INSERT INTO embedding_projections(source_id,index_id,status,active_generation_token) VALUES($1,$2,'ready',$3)",
      )
      .bind(source_id)
      .bind(index_id)
      .bind(token)
      .execute(&pool)
      .await
      .unwrap();
      sqlx::query(
        "INSERT INTO \
         embedding_chunks(generation_token,workspace_id,index_id,source_id,chunk_index,content,embedding,source_kind,\
         doc_id,unit_id,visibility) VALUES($1,$2,$3,$4,0,$5,$6::vector,'document',$5,'unit','page')",
      )
      .bind(token)
      .bind(&workspace_id)
      .bind(index_id)
      .bind(source_id)
      .bind(doc_id)
      .bind(vector_literal(&embedding))
      .execute(&pool)
      .await
      .unwrap();
    }
    let mut request = input("document", "workspace");
    request.workspace_id = workspace_id.clone();
    request.retrieval.required_doc_ids = vec!["hidden".to_string(), "visible".to_string()];
    let allowed = legacy_document_ids(&pool, &workspace_id).await.unwrap().unwrap();
    assert_eq!(
      workspace_candidates(&pool, &request, index_id, &vector, 1, dims, None)
        .await
        .unwrap()[0]
        .source_key,
      "hidden"
    );
    assert_eq!(
      workspace_candidates(&pool, &request, index_id, &vector, 1, dims, Some(&allowed))
        .await
        .unwrap()[0]
        .source_key,
      "visible"
    );
    assert_eq!(
      exact_candidates(&pool, &request, index_id, &vector, 1, dims, Some(&allowed))
        .await
        .unwrap()[0]
        .source_key,
      "visible"
    );
    assert_eq!(
      large_required_candidates(&pool, &request, index_id, &vector, 1, dims, Some(&allowed))
        .await
        .unwrap()[0]
        .source_key,
      "visible"
    );
    let storage =
      std::sync::Arc::new(crate::runtime::object_storage::ObjectStorageService::from_config_json("{}").unwrap());
    let mut read = crate::runtime::types::ReadEmbeddingSourceContentInput {
      workspace_id: workspace_id.clone(),
      source_kind: "document".into(),
      source_key: "hidden".into(),
      retrieval: RuntimeRetrievalScope {
        mode: "workspace".into(),
        required_doc_ids: vec![],
        required_artifact_ids: vec![],
        preferred_source_ids: vec![],
      },
      max_chars: None,
      cursor: None,
    };
    assert!(
      super::super::read::read_source_content(&pool, storage.clone(), &read)
        .await
        .err()
        .unwrap()
        .to_string()
        .contains("embedding_source_not_found")
    );
    read.source_key = "visible".into();
    let content = super::super::read::read_source_content(&pool, storage, &read)
      .await
      .unwrap();
    assert_eq!(content.content, "visible");
    for filtered in [false, true] {
      let start = std::time::Instant::now();
      for _ in 0..20 {
        let allowed = if filtered {
          legacy_document_ids(&pool, &workspace_id).await.unwrap()
        } else {
          None
        };
        workspace_candidates(&pool, &request, index_id, &vector, 1, dims, allowed.as_deref())
          .await
          .unwrap();
      }
      eprintln!(
        "embedding membership filtered={filtered}: {:.3} ms/request (20 requests, 2 documents)",
        start.elapsed().as_secs_f64() * 1000.0 / 20.0
      );
    }
    sqlx::query("DELETE FROM embedding_chunks WHERE workspace_id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM embedding_sources WHERE workspace_id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM embedding_workspace_states WHERE workspace_id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM embedding_indexes WHERE workspace_id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM snapshots WHERE workspace_id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
  }
}
