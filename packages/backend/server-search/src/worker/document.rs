use sqlx::{PgPool, Row};
use uuid::Uuid;

use super::DOCUMENT_LEASE_SECONDS;
use crate::embedded::EmbeddedSearchIndex;
use crate::error::{SearchError, SearchResult};
use crate::generation::ActiveGeneration;
use crate::projection::{ProjectionInput, project_document};
use crate::provider::{SearchChange, SearchProvider, projection_external_id};
use crate::types::SearchTable;
use crate::{DOCUMENT_PROJECTION_FAILED, is_ordinary_workspace_doc, provider_payload};

struct DocumentClaim {
  fence: i64,
  target_source_version: i64,
  target_source_exists: bool,
  target_permission_version: i64,
}

struct ProjectionTuple {
  source_version: i64,
  source_exists: bool,
  permission_version: i64,
}

pub(super) async fn upsert_document(
  pool: &PgPool,
  embedded: &EmbeddedSearchIndex,
  remote: Option<&SearchProvider>,
  generation: &ActiveGeneration,
  workspace_id: &str,
  doc_id: &str,
) -> SearchResult<()> {
  let ordinary = is_ordinary_workspace_doc(workspace_id, doc_id);
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| SearchError::database("begin search document enqueue", error))?;
  sqlx::query("SELECT pg_advisory_xact_lock_shared(hashtextextended('search-projection-ws:' || $1, 0))")
    .bind(workspace_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| SearchError::database("lock search document enqueue", error))?;

  let updated = sqlx::query(
    r#"UPDATE search_projection.document_states state
       SET target_source_exists = state.target_source_exists AND $4,
           target_permission_version = GREATEST(state.target_permission_version, workspace.required_permission_version),
           available_at = CASE WHEN state.last_error IS NULL THEN now() ELSE state.available_at END,
           updated_at = now()
       FROM search_projection.workspace_states workspace
       WHERE state.generation_id = $1 AND state.workspace_id = $2 AND state.doc_id = $3
         AND workspace.generation_id = state.generation_id AND workspace.workspace_id = state.workspace_id"#,
  )
  .bind(generation.id)
  .bind(workspace_id)
  .bind(doc_id)
  .bind(ordinary)
  .execute(&mut *transaction)
  .await
  .map_err(|error| SearchError::database("refresh search document target", error))?
  .rows_affected();

  if updated == 0 {
    sqlx::query(
      r#"INSERT INTO search_projection.document_states
         (generation_id, workspace_id, doc_id, target_source_version, target_source_exists, target_permission_version)
         SELECT $1, $2, $3, nextval('search_projection.source_mutation_version'),
                $4 AND (EXISTS(SELECT 1 FROM snapshots WHERE workspace_id = $2 AND guid = $3)
                  OR EXISTS(SELECT 1 FROM updates WHERE workspace_id = $2 AND guid = $3)),
                required_permission_version
         FROM search_projection.workspace_states
         WHERE generation_id = $1 AND workspace_id = $2"#,
    )
    .bind(generation.id)
    .bind(workspace_id)
    .bind(doc_id)
    .bind(ordinary)
    .execute(&mut *transaction)
    .await
    .map_err(|error| SearchError::database("enqueue search document", error))?;
  }
  transaction
    .commit()
    .await
    .map_err(|error| SearchError::database("commit search document enqueue", error))?;

  let Some(claim) = claim_document(pool, generation.id, workspace_id, doc_id).await? else {
    let published = sqlx::query_as::<_, (i64, bool, i64)>(
      r#"SELECT target_source_version, target_source_exists, target_permission_version
         FROM search_projection.document_states
         WHERE generation_id = $1 AND workspace_id = $2 AND doc_id = $3
           AND target_source_version = published_source_version
           AND target_source_exists = published_source_exists
           AND target_permission_version = published_permission_version
           AND (lease_expires_at IS NULL OR lease_expires_at <= now())"#,
    )
    .bind(generation.id)
    .bind(workspace_id)
    .bind(doc_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| SearchError::database("load published search repair tuple", error))?;
    if let Some((source_version, source_exists, permission_version)) = published {
      let projection_tuple = ProjectionTuple {
        source_version,
        source_exists,
        permission_version,
      };
      let Some(changes) = projection_changes_or_fail(pool, generation, workspace_id, doc_id, &projection_tuple).await?
      else {
        return Ok(());
      };
      apply_changes(embedded, remote, generation, changes).await?;
    }
    return Ok(());
  };

  let projection_tuple = ProjectionTuple {
    source_version: claim.target_source_version,
    source_exists: claim.target_source_exists,
    permission_version: claim.target_permission_version,
  };
  let Some(changes) = projection_changes_or_fail(pool, generation, workspace_id, doc_id, &projection_tuple).await?
  else {
    return Ok(());
  };
  renew_document_claim(pool, generation.id, workspace_id, doc_id, claim.fence).await?;
  apply_changes(embedded, remote, generation, changes).await?;
  complete_document(pool, generation.id, workspace_id, doc_id, &claim).await?;
  Ok(())
}

async fn projection_changes(
  pool: &PgPool,
  generation: &ActiveGeneration,
  workspace_id: &str,
  doc_id: &str,
  projection_tuple: ProjectionTuple,
) -> SearchResult<Vec<SearchChange>> {
  if !projection_tuple.source_exists {
    return Ok(Vec::new());
  }
  let Some((document, blocks)) = project_document(pool, workspace_id, doc_id).await? else {
    return Err(SearchError::SourceInvalid("document source is unavailable".to_owned()));
  };
  let mut changes = Vec::with_capacity(blocks.len() + 1);
  changes.push(change(
    document,
    generation,
    projection_tuple.source_version,
    projection_tuple.permission_version,
    SearchTable::Doc,
  )?);
  for block in blocks {
    changes.push(change(
      block,
      generation,
      projection_tuple.source_version,
      projection_tuple.permission_version,
      SearchTable::Block,
    )?);
  }
  Ok(changes)
}

async fn projection_changes_or_fail(
  pool: &PgPool,
  generation: &ActiveGeneration,
  workspace_id: &str,
  doc_id: &str,
  projection_tuple: &ProjectionTuple,
) -> SearchResult<Option<Vec<SearchChange>>> {
  match projection_changes(
    pool,
    generation,
    workspace_id,
    doc_id,
    ProjectionTuple {
      source_version: projection_tuple.source_version,
      source_exists: projection_tuple.source_exists,
      permission_version: projection_tuple.permission_version,
    },
  )
  .await
  {
    Ok(changes) => Ok(Some(changes)),
    Err(error) if error.is_permanent_search_source() => {
      mark_document_failed(pool, generation.id, workspace_id, doc_id, projection_tuple).await?;
      Ok(None)
    }
    Err(error) => Err(error),
  }
}

async fn mark_document_failed(
  pool: &PgPool,
  generation_id: Uuid,
  workspace_id: &str,
  doc_id: &str,
  projection_tuple: &ProjectionTuple,
) -> SearchResult<()> {
  sqlx::query(
    r#"UPDATE search_projection.document_states
       SET last_error = $7, available_at = 'infinity'::timestamptz,
           claim_fence = NULL, lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
       WHERE generation_id = $1 AND workspace_id = $2 AND doc_id = $3
         AND target_source_version = $4 AND target_source_exists = $5
         AND target_permission_version = $6"#,
  )
  .bind(generation_id)
  .bind(workspace_id)
  .bind(doc_id)
  .bind(projection_tuple.source_version)
  .bind(projection_tuple.source_exists)
  .bind(projection_tuple.permission_version)
  .bind(DOCUMENT_PROJECTION_FAILED)
  .execute(pool)
  .await
  .map_err(|error| SearchError::database("mark search document projection failed", error))?;
  Ok(())
}

async fn renew_document_claim(
  pool: &PgPool,
  generation_id: Uuid,
  workspace_id: &str,
  doc_id: &str,
  fence: i64,
) -> SearchResult<()> {
  let updated = sqlx::query(
    r#"UPDATE search_projection.document_states
       SET lease_expires_at = now() + make_interval(secs => $5), updated_at = now()
       WHERE generation_id = $1 AND workspace_id = $2 AND doc_id = $3 AND claim_fence = $4
         AND lease_expires_at > now()"#,
  )
  .bind(generation_id)
  .bind(workspace_id)
  .bind(doc_id)
  .bind(fence)
  .bind(DOCUMENT_LEASE_SECONDS)
  .execute(pool)
  .await
  .map_err(|error| SearchError::database("renew search document claim", error))?
  .rows_affected();
  if updated != 1 {
    return Err(SearchError::invalid_state("search document claim lost"));
  }
  Ok(())
}

async fn claim_document(
  pool: &PgPool,
  generation_id: Uuid,
  workspace_id: &str,
  doc_id: &str,
) -> SearchResult<Option<DocumentClaim>> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| SearchError::database("begin search document claim", error))?;
  let row = sqlx::query(
    r#"SELECT generation_id, workspace_id, doc_id, target_source_version, target_source_exists, target_permission_version
       FROM search_projection.document_states
       WHERE generation_id = $1 AND workspace_id = $2 AND doc_id = $3 AND available_at <= now()
         AND (lease_expires_at IS NULL OR lease_expires_at <= now())
         AND (target_source_version <> published_source_version
           OR target_source_exists <> published_source_exists
           OR target_permission_version <> published_permission_version)
       FOR UPDATE SKIP LOCKED"#,
  )
  .bind(generation_id)
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(&mut *tx)
  .await
  .map_err(|error| SearchError::database("claim search document publication", error))?;
  let Some(row) = row else {
    tx.rollback()
      .await
      .map_err(|error| SearchError::database("rollback empty search document claim", error))?;
    return Ok(None);
  };
  let fence: i64 = sqlx::query_scalar("SELECT nextval('search_projection.claim_fence')")
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| SearchError::database("allocate search claim fence", error))?;
  let target_source_version: i64 = row
    .try_get("target_source_version")
    .map_err(|error| SearchError::database("decode search state source version", error))?;
  let target_source_exists: bool = row
    .try_get("target_source_exists")
    .map_err(|error| SearchError::database("decode search state source existence", error))?;
  let target_permission_version: i64 = row
    .try_get("target_permission_version")
    .map_err(|error| SearchError::database("decode search publication permission version", error))?;

  sqlx::query(
    r#"UPDATE search_projection.document_states
       SET claim_fence = $4, lease_owner = $5, lease_expires_at = now() + make_interval(secs => $6),
           attempt_count = attempt_count + 1, updated_at = now()
       WHERE generation_id = $1 AND workspace_id = $2 AND doc_id = $3"#,
  )
  .bind(generation_id)
  .bind(workspace_id)
  .bind(doc_id)
  .bind(fence)
  .bind(format!("server-search-{}", std::process::id()))
  .bind(DOCUMENT_LEASE_SECONDS)
  .execute(&mut *tx)
  .await
  .map_err(|error| SearchError::database("write search document claim", error))?;
  tx.commit()
    .await
    .map_err(|error| SearchError::database("commit search document claim", error))?;
  Ok(Some(DocumentClaim {
    fence,
    target_source_version,
    target_source_exists,
    target_permission_version,
  }))
}

async fn complete_document(
  pool: &PgPool,
  generation_id: Uuid,
  workspace_id: &str,
  doc_id: &str,
  claim: &DocumentClaim,
) -> SearchResult<()> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| SearchError::database("begin search document completion", error))?;
  let completed = sqlx::query(
    r#"UPDATE search_projection.document_states
       SET published_source_version = $5, published_source_exists = $6,
           published_permission_version = $7, claim_fence = NULL, lease_owner = NULL,
           lease_expires_at = NULL, last_error = NULL, updated_at = now()
       WHERE generation_id = $1 AND workspace_id = $2 AND doc_id = $3 AND claim_fence = $4
         AND target_source_version = $5 AND target_source_exists = $6
         AND target_permission_version = $7"#,
  )
  .bind(generation_id)
  .bind(workspace_id)
  .bind(doc_id)
  .bind(claim.fence)
  .bind(claim.target_source_version)
  .bind(claim.target_source_exists)
  .bind(claim.target_permission_version)
  .execute(&mut *tx)
  .await
  .map_err(|error| SearchError::database("publish search document state", error))?
  .rows_affected();
  if completed == 0 {
    sqlx::query(
      r#"UPDATE search_projection.document_states
         SET available_at = now(), lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
         WHERE generation_id = $1 AND workspace_id = $2 AND doc_id = $3 AND claim_fence = $4"#,
    )
    .bind(generation_id)
    .bind(workspace_id)
    .bind(doc_id)
    .bind(claim.fence)
    .execute(&mut *tx)
    .await
    .map_err(|error| SearchError::database("reschedule changed search document state", error))?;
  } else {
    sqlx::query(
      r#"UPDATE search_projection.workspace_states state
         SET applied_permission_version = GREATEST(state.applied_permission_version, state.required_permission_version),
             updated_at = now()
         WHERE state.generation_id = $1 AND state.workspace_id = $2
           AND state.required_permission_version <= $3
           AND state.pending_scope = 'none'
           AND NOT EXISTS(
             SELECT 1 FROM search_projection.document_states document
             WHERE document.generation_id = state.generation_id AND document.workspace_id = state.workspace_id
               AND document.last_error IS NULL
               AND document.target_permission_version <> document.published_permission_version
           )"#,
    )
    .bind(generation_id)
    .bind(workspace_id)
    .bind(claim.target_permission_version)
    .execute(&mut *tx)
    .await
    .map_err(|error| SearchError::database("advance search permission state", error))?;
  }
  tx.commit()
    .await
    .map_err(|error| SearchError::database("commit search document completion", error))
}

fn change(
  input: ProjectionInput,
  generation: &ActiveGeneration,
  source_version: i64,
  permission_version: i64,
  table: SearchTable,
) -> SearchResult<SearchChange> {
  let mut payload = provider_payload(&input.payload);
  payload["generation_id"] = serde_json::json!(generation.id.to_string());
  payload["source_version"] = serde_json::json!(source_version);
  payload["permission_version"] = serde_json::json!(permission_version);
  let block_id = payload.get("block_id").and_then(serde_json::Value::as_str);
  let external_id = projection_external_id(
    table,
    &generation.id.to_string(),
    &input.workspace_id,
    &input.doc_id,
    block_id,
    source_version,
    permission_version,
  )?;
  Ok(SearchChange {
    table,
    external_id,
    workspace_id: input.workspace_id,
    doc_id: input.doc_id,
    source_version,
    permission_version,
    payload,
  })
}

async fn apply_changes(
  embedded: &EmbeddedSearchIndex,
  remote: Option<&SearchProvider>,
  generation: &ActiveGeneration,
  changes: Vec<SearchChange>,
) -> SearchResult<()> {
  let mut by_table = [Vec::new(), Vec::new()];
  for change in changes {
    let index = match change.table {
      SearchTable::Doc => 0,
      SearchTable::Block => 1,
    };
    by_table[index].push(change);
  }
  if let Some(remote) = remote {
    for (index, changes) in by_table.into_iter().enumerate() {
      if !changes.is_empty() {
        let table = if index == 0 {
          SearchTable::Doc
        } else {
          SearchTable::Block
        };
        remote.apply(generation.physical_table(table)?, &changes).await?;
      }
    }
    return Ok(());
  }
  for (index, changes) in by_table.into_iter().enumerate() {
    let table = if index == 0 { "doc" } else { "block" };
    let upserts: Vec<_> = changes.into_iter().map(|c| c.payload).collect();
    if !upserts.is_empty() {
      embedded.write_for_generation(generation.id, table, upserts).await?;
    }
  }
  Ok(())
}
