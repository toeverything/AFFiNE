use sqlx::{PgPool, Postgres, Transaction};

use super::{IndexProbeClaim, ProjectionClaim, RuntimeError, RuntimeResult};

async fn begin_claim(pool: &PgPool) -> RuntimeResult<Transaction<'_, Postgres>> {
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin embedding claim failed", error))?;
  sqlx::query("SET LOCAL statement_timeout = '5s'")
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("set embedding claim timeout failed", error))?;
  Ok(transaction)
}

pub(super) async fn claim_projection(pool: &PgPool, owner: &str) -> RuntimeResult<Option<ProjectionClaim>> {
  let mut transaction = begin_claim(pool).await?;
  let claim = sqlx::query_as(
    r#"WITH candidate AS(
      SELECT projection.source_id,projection.index_id
      FROM embedding_projections projection
      JOIN embedding_sources source ON source.id=projection.source_id
      JOIN embedding_workspace_states state ON state.workspace_id=source.workspace_id
        AND state.active_index_id=projection.index_id
      JOIN embedding_indexes index_fact ON index_fact.id=projection.index_id AND index_fact.health_status='ready'
      WHERE state.runtime_state='active' AND source.deleted_at IS NULL AND(
        projection.status='pending'
        OR projection.status='retry_wait' AND projection.next_attempt_at<=statement_timestamp()
        OR projection.status='running' AND projection.lease_until<=statement_timestamp())
      AND NOT EXISTS(
        SELECT 1 FROM embedding_projections running
        JOIN embedding_sources running_source ON running_source.id=running.source_id
        WHERE running.status='running' AND running.lease_until>statement_timestamp()
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
  .fetch_optional(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("claim embedding projection failed", error))?;
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit embedding claim failed", error))?;
  Ok(claim)
}

pub(super) async fn claim_index_probe(pool: &PgPool, owner: &str) -> RuntimeResult<Option<IndexProbeClaim>> {
  let mut transaction = begin_claim(pool).await?;
  let claim = sqlx::query_as(
    r#"WITH candidate AS(
      SELECT index_fact.id FROM embedding_indexes index_fact
      JOIN embedding_workspace_states state ON state.active_index_id=index_fact.id
      WHERE state.runtime_state='active'
        AND (index_fact.probe_lease_until IS NULL OR index_fact.probe_lease_until<=statement_timestamp()) AND(
        index_fact.health_status='pending'
        OR index_fact.health_status='retry_wait' AND index_fact.next_probe_at<=statement_timestamp()
        OR index_fact.probe_lease_until<=statement_timestamp())
      ORDER BY index_fact.next_probe_at NULLS FIRST,index_fact.updated_at
      FOR UPDATE OF index_fact SKIP LOCKED LIMIT 1
    ) UPDATE embedding_indexes index_fact SET probe_lease_owner=$1,
      probe_lease_until=clock_timestamp()+interval '2 minutes',updated_at=now()
    FROM candidate WHERE index_fact.id=candidate.id
    RETURNING index_fact.id,index_fact.workspace_id,index_fact.fingerprint,index_fact.probe_lease_owner"#,
  )
  .bind(owner)
  .fetch_optional(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("claim embedding index probe failed", error))?;
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit embedding claim failed", error))?;
  Ok(claim)
}

pub(super) async fn release_index_probe(pool: &PgPool, claim: &IndexProbeClaim) -> RuntimeResult<()> {
  let mut transaction = begin_claim(pool).await?;
  sqlx::query(
    "UPDATE embedding_indexes SET probe_lease_owner=NULL,probe_lease_until=now() WHERE id=$1 AND probe_lease_owner=$2",
  )
  .bind(claim.id)
  .bind(&claim.probe_lease_owner)
  .execute(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("release embedding probe failed", error))?;
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit embedding probe release failed", error))
}

pub(super) async fn release_projection(pool: &PgPool, claim: &ProjectionClaim) -> RuntimeResult<()> {
  let mut transaction = begin_claim(pool).await?;
  sqlx::query(
    "UPDATE embedding_projections SET status='pending',lease_owner=NULL,lease_until=NULL,next_attempt_at=NULL WHERE \
     source_id=$1 AND index_id=$2 AND lease_token=$3 AND status='running'",
  )
  .bind(claim.source_id)
  .bind(claim.index_id)
  .bind(claim.lease_token)
  .execute(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("release embedding projection failed", error))?;
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit embedding projection release failed", error))
}
