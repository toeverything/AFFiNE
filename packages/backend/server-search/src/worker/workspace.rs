use sqlx::{PgPool, Row};

use super::anti_entropy::{reconcile_stale_provider_rows, sweep_deleted_workspace};
use super::document::upsert_document;
use super::inventory::{DocumentReconcilePhase, reconcile_documents};
use super::workspace_state::{
  WorkspacePhase, checkpoint_workspace, checkpoint_workspace_after, claim_workspace, complete_workspace,
  delete_workspace_state, mark_workspace_failed, renew_workspace_lease,
};
use super::{DOCUMENT_LEASE_SECONDS, RECONCILE_BATCH, WorkspaceReconcileContext, WorkspaceStep};
use crate::embedded::EmbeddedSearchIndex;
use crate::error::{SearchError, SearchResult};
use crate::generation::ActiveGeneration;
use crate::provider::SearchProvider;
use crate::types::SearchTable;

const DUE_DOCUMENT_PUBLICATION_BATCH_SQL: &str = r#"SELECT doc_id
     FROM search_projection.document_states
     WHERE generation_id = $1 AND workspace_id = $2 AND available_at <= now()
       AND last_error IS NULL
       AND (lease_expires_at IS NULL OR lease_expires_at <= now())
       AND (target_source_version <> published_source_version
         OR target_source_exists <> published_source_exists
         OR target_permission_version <> published_permission_version)
       AND ($3::text IS NULL OR doc_id > $3)
     ORDER BY doc_id LIMIT $4"#;

pub async fn reconcile_workspace(
  pool: &PgPool,
  embedded: &EmbeddedSearchIndex,
  remote: Option<&SearchProvider>,
  generation: &ActiveGeneration,
  workspace_id: &str,
) -> SearchResult<bool> {
  sqlx::query(
    r#"INSERT INTO search_projection.workspace_states(generation_id, workspace_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING"#,
  )
  .bind(generation.id)
  .bind(workspace_id)
  .execute(pool)
  .await
  .map_err(|error| SearchError::database("ensure search workspace state", error))?;

  let Some(claim) = claim_workspace(pool, generation.id, workspace_id).await? else {
    return Ok(false);
  };
  let context = WorkspaceReconcileContext {
    pool,
    embedded,
    remote,
    generation,
    workspace_id,
    fence: claim.fence,
  };

  if let WorkspacePhase::Deleted { table, quiet } = claim.progress.phase.clone() {
    match sweep_deleted_workspace(&context, table, quiet).await? {
      WorkspaceStep::Continue(progress) => {
        checkpoint_workspace(
          pool,
          generation.id,
          workspace_id,
          claim.fence,
          claim.progress.with_phase(progress).value(),
        )
        .await?;
      }
      WorkspaceStep::Quiet(progress) => {
        checkpoint_workspace_after(
          pool,
          generation.id,
          workspace_id,
          claim.fence,
          claim.progress.with_phase(progress).value(),
          DOCUMENT_LEASE_SECONDS,
        )
        .await?;
      }
      WorkspaceStep::Complete => {
        delete_workspace_state(pool, generation.id, workspace_id, claim.fence).await?;
      }
    }
    return Ok(true);
  }

  if let WorkspacePhase::Stale { table, cursor } = claim.progress.phase.clone() {
    match reconcile_stale_provider_rows(&context, table, cursor).await? {
      WorkspaceStep::Continue(progress) => {
        checkpoint_workspace(
          pool,
          generation.id,
          workspace_id,
          claim.fence,
          claim.progress.with_phase(progress).value(),
        )
        .await?;
        return Ok(true);
      }
      WorkspaceStep::Quiet(_) => unreachable!("stale reconciliation does not schedule a quiet period"),
      WorkspaceStep::Complete => {}
    }
    complete_workspace(
      pool,
      generation,
      workspace_id,
      claim.progress.captured_root_revision,
      claim.progress.captured_permission_version,
      claim.fence,
    )
    .await?;
    return Ok(true);
  }

  if let WorkspacePhase::Source { after_doc_id } = claim.progress.phase.clone() {
    match reconcile_documents(
      &context,
      claim.progress.captured_permission_version,
      after_doc_id,
      DocumentReconcilePhase::Source,
    )
    .await
    {
      Ok(WorkspaceStep::Continue(progress)) => {
        checkpoint_workspace(
          pool,
          generation.id,
          workspace_id,
          claim.fence,
          claim.progress.with_phase(progress).value(),
        )
        .await?;
        return Ok(true);
      }
      Ok(WorkspaceStep::Quiet(_)) => unreachable!("source reconciliation does not schedule a quiet period"),
      Ok(WorkspaceStep::Complete) => {}
      Err(error) if error.is_permanent_search_source() => {
        mark_workspace_failed(pool, generation.id, workspace_id, claim.fence).await?;
        return Ok(true);
      }
      Err(error) => return Err(error),
    }
    checkpoint_workspace(
      pool,
      generation.id,
      workspace_id,
      claim.fence,
      claim
        .progress
        .with_phase(WorkspacePhase::Stale {
          table: SearchTable::Doc,
          cursor: None,
        })
        .value(),
    )
    .await?;
    return Ok(true);
  }

  let (mut after_publication_doc_id, after_doc_id, scan_workspace) = match claim.progress.phase.clone() {
    WorkspacePhase::Publications {
      after_publication_doc_id,
      resume_after_doc_id,
      scan_workspace,
    } => (after_publication_doc_id, resume_after_doc_id, scan_workspace),
    WorkspacePhase::Documents { after_doc_id } => (None, after_doc_id, true),
    WorkspacePhase::Source { .. } => unreachable!("source progress handled above"),
    WorkspacePhase::Stale { .. } => unreachable!("stale progress handled above"),
    WorkspacePhase::Deleted { .. } => unreachable!("deleted progress handled above"),
  };

  let publication_rows = sqlx::query(DUE_DOCUMENT_PUBLICATION_BATCH_SQL)
    .bind(generation.id)
    .bind(workspace_id)
    .bind(&after_publication_doc_id)
    .bind(RECONCILE_BATCH + 1)
    .fetch_all(pool)
    .await
    .map_err(|error| SearchError::database("load due search document publications", error))?;
  let publications_complete = publication_rows.len() <= RECONCILE_BATCH as usize;
  for row in publication_rows.into_iter().take(RECONCILE_BATCH as usize) {
    let doc_id: String = row
      .try_get("doc_id")
      .map_err(|error| SearchError::database("decode due search document publication", error))?;
    if !renew_workspace_lease(pool, generation.id, workspace_id, claim.fence).await? {
      return Ok(false);
    }
    upsert_document(pool, embedded, remote, generation, workspace_id, &doc_id).await?;
    after_publication_doc_id = Some(doc_id);
  }
  if !publications_complete {
    checkpoint_workspace(
      pool,
      generation.id,
      workspace_id,
      claim.fence,
      claim
        .progress
        .with_phase(WorkspacePhase::Publications {
          after_publication_doc_id,
          resume_after_doc_id: after_doc_id,
          scan_workspace,
        })
        .value(),
    )
    .await?;
    return Ok(true);
  }

  let has_due_publications: bool = sqlx::query_scalar(
    r#"SELECT EXISTS(
         SELECT 1 FROM search_projection.document_states
         WHERE generation_id = $1 AND workspace_id = $2 AND available_at <= now()
           AND last_error IS NULL
           AND (lease_expires_at IS NULL OR lease_expires_at <= now())
           AND (target_source_version <> published_source_version
             OR target_source_exists <> published_source_exists
             OR target_permission_version <> published_permission_version)
       )"#,
  )
  .bind(generation.id)
  .bind(workspace_id)
  .fetch_one(pool)
  .await
  .map_err(|error| SearchError::database("check due search document publications", error))?;
  if has_due_publications {
    checkpoint_workspace(
      pool,
      generation.id,
      workspace_id,
      claim.fence,
      claim
        .progress
        .with_phase(WorkspacePhase::Publications {
          after_publication_doc_id: None,
          resume_after_doc_id: after_doc_id,
          scan_workspace,
        })
        .value(),
    )
    .await?;
    return Ok(true);
  }

  if !scan_workspace {
    complete_workspace(
      pool,
      generation,
      workspace_id,
      claim.progress.captured_root_revision,
      claim.progress.captured_permission_version,
      claim.fence,
    )
    .await?;
    return Ok(true);
  }

  match reconcile_documents(
    &context,
    claim.progress.captured_permission_version,
    after_doc_id,
    DocumentReconcilePhase::Documents,
  )
  .await
  {
    Ok(WorkspaceStep::Continue(progress)) => {
      checkpoint_workspace(
        pool,
        generation.id,
        workspace_id,
        claim.fence,
        claim.progress.with_phase(progress).value(),
      )
      .await?;
      return Ok(true);
    }
    Ok(WorkspaceStep::Complete) => {}
    Ok(WorkspaceStep::Quiet(_)) => unreachable!("document reconcile does not schedule a quiet period"),
    Err(error) if error.is_permanent_search_source() => {
      mark_workspace_failed(pool, generation.id, workspace_id, claim.fence).await?;
      return Ok(true);
    }
    Err(error) => return Err(error),
  }

  checkpoint_workspace(
    pool,
    generation.id,
    workspace_id,
    claim.fence,
    claim
      .progress
      .with_phase(WorkspacePhase::Source { after_doc_id: None })
      .value(),
  )
  .await?;
  Ok(true)
}
