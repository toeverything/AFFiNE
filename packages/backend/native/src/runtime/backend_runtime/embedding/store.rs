use chrono::Utc;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use super::{
  ChunkLocator, EmbeddingFailure, EmbeddingGcResult, EmbeddingQueueCounts, FailureClass, IndexProbeClaim,
  MaterializedChunk, ProjectionClaim, RuntimeError, RuntimeResult, validate_vectors,
};

pub(super) async fn queue_counts(pool: &PgPool) -> RuntimeResult<EmbeddingQueueCounts> {
  sqlx::query_as(
    r#"SELECT
      count(*) FILTER (WHERE status='pending')::bigint AS pending,
      count(*) FILTER (WHERE status='running')::bigint AS running,
      count(*) FILTER (WHERE status='retry_wait')::bigint AS retry_wait,
      count(*) FILTER (WHERE status='ready')::bigint AS ready,
      count(*) FILTER (WHERE status='failed')::bigint AS failed,
      count(*) FILTER (WHERE status='running' AND lease_until<=clock_timestamp())::bigint AS expired_leases,
      coalesce(extract(epoch FROM clock_timestamp()-min(updated_at) FILTER(
        WHERE status IN('pending','retry_wait','running'))),0)::bigint AS oldest_pending_seconds,
      (SELECT count(*)::bigint FROM embedding_chunks chunk
        JOIN embedding_workspace_states state ON state.workspace_id=chunk.workspace_id
          AND state.active_index_id=chunk.index_id AND state.runtime_state='active'
        JOIN embedding_projections projection ON projection.source_id=chunk.source_id
          AND projection.index_id=chunk.index_id
          AND projection.active_generation_token=chunk.generation_token) AS active_vector_rows,
      (SELECT count(*)::bigint FROM embedding_chunks chunk
        LEFT JOIN embedding_workspace_states state ON state.workspace_id=chunk.workspace_id
          AND state.active_index_id=chunk.index_id AND state.runtime_state='active'
        WHERE state.workspace_id IS NULL) AS inactive_vector_rows,
      pg_total_relation_size('embedding_chunks_hnsw')::bigint AS index_bytes,
      (SELECT count(*)::bigint FROM embedding_indexes WHERE health_status='retry_wait') AS retrying_indexes,
      (SELECT coalesce(max(extract(epoch FROM next_probe_at-clock_timestamp())),0)::bigint
        FROM embedding_indexes WHERE health_status='retry_wait') AS max_index_retry_seconds
    FROM embedding_projections"#,
  )
  .fetch_one(pool)
  .await
  .map_err(|error| RuntimeError::database("load embedding queue counts failed", error))
}

pub(super) async fn claim_projection(pool: &PgPool, owner: &str) -> RuntimeResult<Option<ProjectionClaim>> {
  sqlx::query_as(
    r#"WITH candidate AS(
      SELECT projection.source_id,projection.index_id
      FROM embedding_projections projection
      JOIN embedding_sources source ON source.id=projection.source_id
      JOIN embedding_workspace_states state ON state.workspace_id=source.workspace_id
        AND state.active_index_id=projection.index_id
      JOIN embedding_indexes index_fact ON index_fact.id=projection.index_id AND index_fact.health_status='ready'
      WHERE state.runtime_state='active' AND source.deleted_at IS NULL AND(
        projection.status='pending'
        OR projection.status='retry_wait' AND projection.next_attempt_at<=clock_timestamp()
        OR projection.status='running' AND projection.lease_until<=clock_timestamp()
        OR projection.status='ready' AND(
          projection.applied_content_revision IS DISTINCT FROM source.content_revision
          OR projection.applied_descriptor_revision IS DISTINCT FROM source.descriptor_revision
          OR projection.applied_recipe_revision IS DISTINCT FROM source.recipe_revision))
      AND NOT EXISTS(
        SELECT 1 FROM embedding_projections running
        JOIN embedding_sources running_source ON running_source.id=running.source_id
        WHERE running.status='running' AND running.lease_until>clock_timestamp()
          AND running_source.workspace_id=source.workspace_id)
      ORDER BY projection.priority DESC,projection.next_attempt_at NULLS FIRST,projection.updated_at
      FOR UPDATE OF projection SKIP LOCKED LIMIT 1
    ),claimed AS(
      UPDATE embedding_projections projection SET
        status='running',lease_owner=$1,lease_token=projection.lease_token+1,
        lease_until=clock_timestamp()+interval '5 minutes',updated_at=now()
      FROM candidate WHERE projection.source_id=candidate.source_id AND projection.index_id=candidate.index_id
      RETURNING projection.*
    ) SELECT claimed.source_id,claimed.index_id,source.workspace_id,state.index_epoch,
      source.source_kind,source.source_key,source.content_revision,source.descriptor_revision,source.recipe_revision,
      source.storage_scope,source.storage_key,source.file_name,source.mime_type,
      source.document_projection::text AS document_projection,
      claimed.lease_token,claimed.lease_until,index_fact.fingerprint AS index_fingerprint
    FROM claimed JOIN embedding_sources source ON source.id=claimed.source_id
    JOIN embedding_workspace_states state ON state.workspace_id=source.workspace_id
    JOIN embedding_indexes index_fact ON index_fact.id=claimed.index_id"#,
  )
  .bind(owner)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("claim embedding projection failed", error))
}

pub(super) async fn claim_index_probe(pool: &PgPool, owner: &str) -> RuntimeResult<Option<IndexProbeClaim>> {
  sqlx::query_as(
    r#"WITH candidate AS(
      SELECT index_fact.id FROM embedding_indexes index_fact
      JOIN embedding_workspace_states state ON state.active_index_id=index_fact.id
      WHERE state.runtime_state='active' AND(
        index_fact.health_status='pending'
        OR index_fact.health_status='retry_wait' AND index_fact.next_probe_at<=clock_timestamp()
        OR index_fact.probe_lease_until<=clock_timestamp())
      ORDER BY index_fact.next_probe_at NULLS FIRST,index_fact.updated_at
      FOR UPDATE OF index_fact SKIP LOCKED LIMIT 1
    ) UPDATE embedding_indexes index_fact SET probe_lease_owner=$1,
      probe_lease_until=clock_timestamp()+interval '2 minutes',updated_at=now()
    FROM candidate WHERE index_fact.id=candidate.id
    RETURNING index_fact.id,index_fact.workspace_id,index_fact.fingerprint,index_fact.probe_lease_owner"#,
  )
  .bind(owner)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("claim embedding index probe failed", error))
}

#[cfg(test)]
pub(super) async fn claim_index_probe_for_workspace(
  pool: &PgPool,
  owner: &str,
  workspace_id: &str,
) -> RuntimeResult<Option<IndexProbeClaim>> {
  sqlx::query_as(
    r#"WITH candidate AS(
      SELECT index_fact.id FROM embedding_indexes index_fact
      JOIN embedding_workspace_states state ON state.active_index_id=index_fact.id
      WHERE state.workspace_id=$2 AND state.runtime_state='active' AND(
        index_fact.health_status='pending'
        OR index_fact.health_status='retry_wait' AND index_fact.next_probe_at<=clock_timestamp()
        OR index_fact.probe_lease_until<=clock_timestamp())
      ORDER BY index_fact.next_probe_at NULLS FIRST,index_fact.updated_at
      FOR UPDATE OF index_fact SKIP LOCKED LIMIT 1
    ) UPDATE embedding_indexes index_fact SET probe_lease_owner=$1,
      probe_lease_until=clock_timestamp()+interval '2 minutes',updated_at=now()
    FROM candidate WHERE index_fact.id=candidate.id
    RETURNING index_fact.id,index_fact.workspace_id,index_fact.fingerprint,index_fact.probe_lease_owner"#,
  )
  .bind(owner)
  .bind(workspace_id)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("claim embedding index probe for workspace failed", error))
}

pub(super) async fn complete_index_probe(pool: &PgPool, claim: &IndexProbeClaim) -> RuntimeResult<()> {
  sqlx::query(
    "UPDATE embedding_indexes SET \
     health_status='ready',failure_count=0,next_probe_at=NULL,probe_lease_owner=NULL,probe_lease_until=NULL,\
     last_error_code=NULL,updated_at=now() WHERE id=$1 AND probe_lease_owner=$2",
  )
  .bind(claim.id)
  .bind(&claim.probe_lease_owner)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("complete embedding index probe failed", error))?;
  Ok(())
}

pub(super) async fn fail_index_probe(pool: &PgPool, claim: &IndexProbeClaim, code: &str) -> RuntimeResult<()> {
  sqlx::query(
    r#"UPDATE embedding_indexes SET health_status='retry_wait',failure_count=failure_count+1,
    next_probe_at=clock_timestamp()+least(interval '6 hours',interval '5 seconds'*
      power(2,least(failure_count,12))*(0.8+(abs(hashtext(id::text))%41)/100.0)),
    probe_lease_owner=NULL,probe_lease_until=NULL,last_error_code=$3,updated_at=now()
    WHERE id=$1 AND probe_lease_owner=$2"#,
  )
  .bind(claim.id)
  .bind(&claim.probe_lease_owner)
  .bind(code)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("fail embedding index probe failed", error))?;
  Ok(())
}

pub(super) async fn commit_token(
  pool: &PgPool,
  claim: &ProjectionClaim,
  chunks: &[MaterializedChunk],
) -> RuntimeResult<String> {
  if chunks.is_empty() || chunks.len() > 2048 || !validate_vectors(chunks) {
    return Err(RuntimeError::invalid_input("invalid embedding token"));
  }
  for (index, chunk) in chunks.iter().enumerate() {
    if chunk.index != index as i32 || !locator_matches_claim(&chunk.locator, claim) {
      return Err(RuntimeError::invalid_input("invalid embedding chunk locator"));
    }
  }
  let token = Uuid::new_v4();
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("embedding token transaction failed", error))?;
  for chunk in chunks {
    insert_chunk(&mut transaction, token, claim, chunk).await?;
  }
  let state =
    sqlx::query("SELECT active_index_id,index_epoch FROM embedding_workspace_states WHERE workspace_id=$1 FOR UPDATE")
      .bind(&claim.workspace_id)
      .fetch_one(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("lock embedding workspace commit fence failed", error))?;
  let source = sqlx::query(
    "SELECT content_revision,descriptor_revision,recipe_revision,deleted_at FROM embedding_sources WHERE id=$1 FOR \
     UPDATE",
  )
  .bind(claim.source_id)
  .fetch_one(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("lock embedding source commit fence failed", error))?;
  let projection = sqlx::query(
    "SELECT lease_token,lease_until FROM embedding_projections WHERE source_id=$1 AND index_id=$2 FOR UPDATE",
  )
  .bind(claim.source_id)
  .bind(claim.index_id)
  .fetch_one(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("lock embedding projection commit fence failed", error))?;
  let state_matches = state.try_get::<Option<Uuid>, _>("active_index_id").ok().flatten() == Some(claim.index_id)
    && state.try_get::<i64, _>("index_epoch").ok() == Some(claim.index_epoch);
  let source_matches = source.try_get::<String, _>("content_revision").ok().as_deref()
    == Some(claim.content_revision.as_str())
    && source.try_get::<String, _>("descriptor_revision").ok().as_deref() == Some(claim.descriptor_revision.as_str())
    && source.try_get::<String, _>("recipe_revision").ok().as_deref() == Some(claim.recipe_revision.as_str())
    && source
      .try_get::<Option<chrono::DateTime<Utc>>, _>("deleted_at")
      .ok()
      .flatten()
      .is_none();
  let lease_matches = projection.try_get::<i64, _>("lease_token").ok() == Some(claim.lease_token)
    && projection
      .try_get::<Option<chrono::DateTime<Utc>>, _>("lease_until")
      .ok()
      .flatten()
      .is_some_and(|until| until > Utc::now());
  if !state_matches || !source_matches || !lease_matches {
    return Err(RuntimeError::invalid_state("stale_embedding_commit"));
  }
  sqlx::query(
    r#"UPDATE embedding_projections SET status='ready',applied_content_revision=$3,
      applied_descriptor_revision=$4,applied_recipe_revision=$5,active_generation_token=$6,
      attempt_count=0,next_attempt_at=NULL,lease_owner=NULL,lease_until=NULL,
      last_error_code=NULL,last_error_detail=NULL,updated_at=now()
    WHERE source_id=$1 AND index_id=$2"#,
  )
  .bind(claim.source_id)
  .bind(claim.index_id)
  .bind(&claim.content_revision)
  .bind(&claim.descriptor_revision)
  .bind(&claim.recipe_revision)
  .bind(token)
  .execute(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("activate embedding token failed", error))?;
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("embedding token commit failed", error))?;
  Ok(token.to_string())
}

async fn insert_chunk(
  transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  token: Uuid,
  claim: &ProjectionClaim,
  chunk: &MaterializedChunk,
) -> RuntimeResult<()> {
  let vector = vector_literal(&chunk.embedding);
  let (doc_id, artifact_id, unit_id, visibility, block_id, element_id, frame_id) = match &chunk.locator {
    ChunkLocator::Document {
      doc_id,
      unit_id,
      visibility,
      block_id,
      element_id,
      frame_id,
    } => (
      Some(doc_id.as_str()),
      None,
      Some(unit_id.as_str()),
      Some(visibility.as_str()),
      block_id.as_deref(),
      element_id.as_deref(),
      frame_id.as_deref(),
    ),
    ChunkLocator::Artifact { artifact_id } => (None, Some(*artifact_id), None, None, None, None, None),
  };
  sqlx::query(
    r#"INSERT INTO embedding_chunks(
      generation_token,workspace_id,index_id,source_id,chunk_index,content,embedding,
      source_kind,doc_id,artifact_id,unit_id,visibility,block_id,element_id,frame_id
    ) VALUES($1,$2,$3,$4,$5,$6,$7::vector,$8,$9,$10,$11,$12,$13,$14,$15)"#,
  )
  .bind(token)
  .bind(&claim.workspace_id)
  .bind(claim.index_id)
  .bind(claim.source_id)
  .bind(chunk.index)
  .bind(&chunk.content)
  .bind(vector)
  .bind(&claim.source_kind)
  .bind(doc_id)
  .bind(artifact_id)
  .bind(unit_id)
  .bind(visibility)
  .bind(block_id)
  .bind(element_id)
  .bind(frame_id)
  .execute(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("insert embedding chunk failed", error))?;
  Ok(())
}

pub(super) async fn fail_projection(
  pool: &PgPool,
  claim: &ProjectionClaim,
  failure: EmbeddingFailure,
) -> RuntimeResult<()> {
  if failure.class == FailureClass::RetryableIndex {
    let mut transaction = pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("begin embedding index failure transaction failed", error))?;
    let released = sqlx::query(
      r#"UPDATE embedding_projections SET status='pending',lease_owner=NULL,lease_until=NULL,
      last_error_code=$4,last_error_detail=$5,updated_at=now()
      WHERE source_id=$1 AND index_id=$2 AND lease_token=$3 AND status='running'"#,
    )
    .bind(claim.source_id)
    .bind(claim.index_id)
    .bind(claim.lease_token)
    .bind(failure.code)
    .bind(failure.detail)
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("release embedding projection after index failure failed", error))?
    .rows_affected();
    if released == 0 {
      return Ok(());
    }
    sqlx::query(
      r#"UPDATE embedding_indexes SET health_status='retry_wait',failure_count=failure_count+1,
      next_probe_at=clock_timestamp()+least(interval '6 hours',interval '5 seconds'*
        power(2,least(failure_count,12))),last_error_code=$2,updated_at=now() WHERE id=$1"#,
    )
    .bind(claim.index_id)
    .bind(failure.code)
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("update embedding index retry gate failed", error))?;
    transaction
      .commit()
      .await
      .map_err(|error| RuntimeError::database("commit embedding index failure transaction failed", error))?;
    return Ok(());
  }
  let retryable = failure.class == FailureClass::RetryableProjection;
  sqlx::query(
    r#"UPDATE embedding_projections SET
      status=CASE WHEN $4 AND attempt_count+1<10 THEN 'retry_wait' ELSE 'failed' END,
      attempt_count=attempt_count+1,
      next_attempt_at=CASE WHEN $4 AND attempt_count+1<10 THEN
        clock_timestamp()+least(interval '6 hours',interval '5 seconds'*power(2,least(attempt_count,12))) ELSE NULL END,
      lease_owner=NULL,lease_until=NULL,last_error_code=$5,last_error_detail=$6,updated_at=now()
    WHERE source_id=$1 AND index_id=$2 AND lease_token=$3 AND status='running'"#,
  )
  .bind(claim.source_id)
  .bind(claim.index_id)
  .bind(claim.lease_token)
  .bind(retryable)
  .bind(failure.code)
  .bind(failure.detail)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("fail embedding projection failed", error))?;
  Ok(())
}

pub(super) async fn gc(pool: &PgPool) -> RuntimeResult<EmbeddingGcResult> {
  let chunks = sqlx::query(
    r#"DELETE FROM embedding_chunks chunk WHERE chunk.created_at<clock_timestamp()-interval '1 hour'
    AND NOT EXISTS(SELECT 1 FROM embedding_projections projection
      WHERE projection.source_id=chunk.source_id AND projection.index_id=chunk.index_id
        AND projection.active_generation_token=chunk.generation_token)"#,
  )
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("delete inactive embedding chunks failed", error))?
  .rows_affected();
  let indexes = sqlx::query(
    r#"DELETE FROM embedding_indexes index_fact
    WHERE index_fact.inactive_at<clock_timestamp()-interval '7 days'
      AND NOT EXISTS(SELECT 1 FROM embedding_workspace_states state WHERE state.active_index_id=index_fact.id)"#,
  )
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("delete inactive embedding indexes failed", error))?
  .rows_affected();
  Ok(EmbeddingGcResult { indexes, chunks })
}

fn locator_matches_claim(locator: &ChunkLocator, claim: &ProjectionClaim) -> bool {
  matches!(
    (claim.source_kind.as_str(), locator),
    ("document", ChunkLocator::Document { .. }) | ("artifact", ChunkLocator::Artifact { .. })
  )
}

fn vector_literal(vector: &[f32]) -> String {
  format!(
    "[{}]",
    vector.iter().map(ToString::to_string).collect::<Vec<_>>().join(",")
  )
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn leases_fence_stale_commits_and_gc_old_tokens_and_indexes() {
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let _guard = crate::runtime::migrations::EMBEDDING_TEST_LOCK.lock().await;
    let pool = PgPool::connect(&database_url).await.unwrap();
    assert!(
      crate::runtime::migrations::migrate_embedding_tables(&pool)
        .await
        .enabled
    );
    sqlx::query("DELETE FROM embedding_workspace_states WHERE workspace_id LIKE 'rust-test-store-%'")
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM embedding_indexes WHERE workspace_id LIKE 'rust-test-store-%'")
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM embedding_sources WHERE workspace_id LIKE 'rust-test-store-%'")
      .execute(&pool)
      .await
      .unwrap();
    let workspace_id = format!("rust-test-store-{}", Uuid::new_v4());
    let index_id = Uuid::new_v4();
    let source_id = Uuid::new_v4();
    sqlx::query(
      r#"INSERT INTO embedding_indexes(
        id,workspace_id,fingerprint,route_source,provider,model_id,
        endpoint_fingerprint,contract_version,health_status)
      VALUES($1,$2,'active','byok','openai','model','endpoint',1,'ready')"#,
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
    sqlx::query(
      r#"INSERT INTO embedding_sources(
        id,workspace_id,source_kind,source_key,content_revision,
        descriptor_revision,recipe_revision,document_projection)
      VALUES($1,$2,'document','doc','content-1','descriptor','recipe','{}')"#,
    )
    .bind(source_id)
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO embedding_projections(source_id,index_id,status,priority) VALUES($1,$2,'pending',2147483647)",
    )
    .bind(source_id)
    .bind(index_id)
    .execute(&pool)
    .await
    .unwrap();

    let stale = claim_projection(&pool, "worker-a").await.unwrap().unwrap();
    let lease_owner: Option<String> =
      sqlx::query_scalar("SELECT lease_owner FROM embedding_projections WHERE source_id=$1 AND index_id=$2")
        .bind(source_id)
        .bind(index_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(lease_owner.as_deref(), Some("worker-a"));
    sqlx::query("UPDATE embedding_projections SET lease_until=now()-interval '1 second' WHERE source_id=$1")
      .bind(source_id)
      .execute(&pool)
      .await
      .unwrap();
    let current = claim_projection(&pool, "worker-b").await.unwrap().unwrap();
    assert!(current.lease_token > stale.lease_token);
    let chunk = |content: &str| MaterializedChunk {
      index: 0,
      content: content.to_string(),
      embedding: vec![0.0; 1024],
      locator: ChunkLocator::Document {
        doc_id: "doc".to_string(),
        unit_id: "unit".to_string(),
        visibility: "page".to_string(),
        block_id: None,
        element_id: None,
        frame_id: None,
      },
    };
    assert!(commit_token(&pool, &stale, &[chunk("stale")]).await.is_err());
    fail_projection(
      &pool,
      &stale,
      EmbeddingFailure {
        code: "provider_unavailable",
        detail: None,
        class: FailureClass::RetryableIndex,
      },
    )
    .await
    .unwrap();
    let current_state: (String, Option<String>, String) = sqlx::query_as(
      r#"SELECT projection.status,projection.lease_owner,index.health_status
      FROM embedding_projections projection
      JOIN embedding_indexes index ON index.id=projection.index_id
      WHERE projection.source_id=$1 AND projection.index_id=$2"#,
    )
    .bind(source_id)
    .bind(index_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
      current_state,
      ("running".to_string(), Some("worker-b".to_string()), "ready".to_string())
    );
    let first_token = commit_token(&pool, &current, &[chunk("first")]).await.unwrap();
    let requested = [crate::runtime::types::DocumentEmbeddingProjectionInput {
      doc_id: "doc".to_string(),
      revision: "content-1".to_string(),
      source_hash: "descriptor".to_string(),
      units: Vec::new(),
      deleted: None,
    }];
    assert_eq!(
      super::super::source::document_readiness(&pool, &workspace_id, &requested)
        .await
        .unwrap(),
      (1, 0)
    );
    sqlx::query("UPDATE embedding_projections SET status='failed' WHERE source_id=$1 AND index_id=$2")
      .bind(source_id)
      .bind(index_id)
      .execute(&pool)
      .await
      .unwrap();
    assert_eq!(
      super::super::source::document_readiness(&pool, &workspace_id, &requested)
        .await
        .unwrap(),
      (0, 1)
    );
    sqlx::query("UPDATE embedding_projections SET status='ready' WHERE source_id=$1 AND index_id=$2")
      .bind(source_id)
      .bind(index_id)
      .execute(&pool)
      .await
      .unwrap();
    let unavailable = [crate::runtime::types::DocumentEmbeddingProjectionInput {
      revision: "not-current".to_string(),
      ..requested[0].clone()
    }];
    assert_eq!(
      super::super::source::document_readiness(&pool, &workspace_id, &unavailable)
        .await
        .unwrap(),
      (0, 0)
    );

    sqlx::query("UPDATE embedding_sources SET content_revision='content-2' WHERE id=$1")
      .bind(source_id)
      .execute(&pool)
      .await
      .unwrap();
    let refreshed = claim_projection(&pool, "worker-c").await.unwrap().unwrap();
    let second_token = commit_token(&pool, &refreshed, &[chunk("second")]).await.unwrap();
    assert_ne!(first_token, second_token);
    sqlx::query("UPDATE embedding_chunks SET created_at=now()-interval '2 hours' WHERE generation_token=$1")
      .bind(Uuid::parse_str(&first_token).unwrap())
      .execute(&pool)
      .await
      .unwrap();
    let inactive_index = Uuid::new_v4();
    sqlx::query(
      r#"INSERT INTO embedding_indexes(
        id,workspace_id,fingerprint,route_source,provider,model_id,
        endpoint_fingerprint,contract_version,health_status,inactive_at)
      VALUES($1,$2,'inactive','byok','openai','old','endpoint',1,'ready',now()-interval '8 days')"#,
    )
    .bind(inactive_index)
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
    let result = gc(&pool).await.unwrap();
    assert_eq!(result.chunks, 1);
    assert_eq!(result.indexes, 1);

    sqlx::query("DELETE FROM embedding_workspace_states WHERE workspace_id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    let unavailable = [crate::runtime::types::DocumentEmbeddingProjectionInput {
      revision: "content-2".to_string(),
      ..requested[0].clone()
    }];
    assert_eq!(
      super::super::source::document_readiness(&pool, &workspace_id, &unavailable)
        .await
        .unwrap(),
      (0, 0)
    );
    sqlx::query("DELETE FROM embedding_sources WHERE workspace_id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM embedding_indexes WHERE workspace_id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
  }
}
