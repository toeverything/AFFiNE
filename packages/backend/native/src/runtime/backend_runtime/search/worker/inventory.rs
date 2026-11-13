use sqlx::Row;

use super::{
  DOCUMENT_PROJECTION_FAILED, ProjectionExpectation, RECONCILE_BATCH, WorkspacePhase, WorkspaceReconcileContext,
  WorkspaceStep, is_ordinary_workspace_doc, load_workspace_doc_states_in, provider_projection_matches,
  renew_workspace_lease, upsert_document,
};
use crate::runtime::{RuntimeError, RuntimeResult};

pub(super) const DOCUMENT_BATCH_SQL: &str = r#"WITH active_document AS (
       SELECT unnest($5::text[]) AS doc_id
     ), candidate AS (
       SELECT doc_id,true AS active_member FROM active_document
       UNION ALL
       SELECT state.doc_id,false
       FROM search_projection.document_states state
       WHERE state.generation_id=$2 AND state.workspace_id=$1
         AND NOT state.doc_id=ANY($5::text[])
     )
     SELECT candidate.doc_id,candidate.active_member
     FROM candidate
     WHERE ($3::text IS NULL OR candidate.doc_id > $3)
     ORDER BY candidate.doc_id LIMIT $4"#;

struct DocumentTarget {
  source_version: i64,
  source_exists: bool,
  permission_version: i64,
  failed: bool,
}

#[derive(Clone, Copy)]
pub(super) enum DocumentReconcilePhase {
  Documents,
  Source,
}

impl DocumentReconcilePhase {
  fn progress(self, after_doc_id: Option<String>) -> WorkspacePhase {
    match self {
      Self::Documents => WorkspacePhase::Documents { after_doc_id },
      Self::Source => WorkspacePhase::Source { after_doc_id },
    }
  }
}

async fn active_document_ids(connection: &mut sqlx::PgConnection, workspace_id: &str) -> RuntimeResult<Vec<String>> {
  Ok(
    load_workspace_doc_states_in(connection, workspace_id)
      .await?
      .into_iter()
      .filter(|doc| doc.lifecycle.is_none() && is_ordinary_workspace_doc(workspace_id, &doc.doc_id))
      .map(|doc| doc.doc_id)
      .collect(),
  )
}

async fn converge_document_membership(
  connection: &mut sqlx::PgConnection,
  generation_id: uuid::Uuid,
  workspace_id: &str,
  doc_id: &str,
  active_member: bool,
) -> RuntimeResult<DocumentTarget> {
  if active_member {
    let row = sqlx::query(
      r#"INSERT INTO search_projection.document_states(
           generation_id,workspace_id,doc_id,target_source_version,target_source_exists,target_permission_version
         )
         SELECT $1,$2,$3,nextval('search_projection.source_mutation_version'),true,required_permission_version
         FROM search_projection.workspace_states
         WHERE generation_id=$1 AND workspace_id=$2
         ON CONFLICT(generation_id,workspace_id,doc_id) DO UPDATE SET
           target_source_version=CASE
             WHEN NOT search_projection.document_states.target_source_exists
             THEN EXCLUDED.target_source_version
             ELSE search_projection.document_states.target_source_version END,
           target_source_exists=true,
           target_permission_version=GREATEST(
             search_projection.document_states.target_permission_version,
             EXCLUDED.target_permission_version
           ),
           claim_fence=CASE
             WHEN NOT search_projection.document_states.target_source_exists
               OR search_projection.document_states.target_permission_version < EXCLUDED.target_permission_version
             THEN NULL ELSE search_projection.document_states.claim_fence END,
           lease_owner=CASE
             WHEN NOT search_projection.document_states.target_source_exists
               OR search_projection.document_states.target_permission_version < EXCLUDED.target_permission_version
             THEN NULL ELSE search_projection.document_states.lease_owner END,
           lease_expires_at=CASE
             WHEN NOT search_projection.document_states.target_source_exists
               OR search_projection.document_states.target_permission_version < EXCLUDED.target_permission_version
             THEN NULL ELSE search_projection.document_states.lease_expires_at END,
           last_error=CASE
             WHEN NOT search_projection.document_states.target_source_exists
             THEN NULL ELSE search_projection.document_states.last_error END,
           available_at=CASE
             WHEN NOT search_projection.document_states.target_source_exists
               OR (search_projection.document_states.last_error IS NULL
                 AND search_projection.document_states.target_permission_version < EXCLUDED.target_permission_version)
             THEN now() ELSE search_projection.document_states.available_at END,
           updated_at=now()
         RETURNING target_source_version,target_source_exists,target_permission_version,last_error"#,
    )
    .bind(generation_id)
    .bind(workspace_id)
    .bind(doc_id)
    .fetch_one(&mut *connection)
    .await
    .map_err(|error| RuntimeError::database("converge live search document membership", error))?;
    return decode_target(row);
  }

  let row = sqlx::query(
    r#"UPDATE search_projection.document_states
       SET target_source_version=CASE WHEN target_source_exists
             THEN nextval('search_projection.source_mutation_version') ELSE target_source_version END,
           target_source_exists=false,
           claim_fence=CASE WHEN target_source_exists THEN NULL ELSE claim_fence END,
           lease_owner=CASE WHEN target_source_exists THEN NULL ELSE lease_owner END,
           lease_expires_at=CASE WHEN target_source_exists THEN NULL ELSE lease_expires_at END,
           last_error=CASE WHEN target_source_exists THEN NULL ELSE last_error END,
           available_at=CASE WHEN target_source_exists THEN now() ELSE available_at END,
           updated_at=now()
       WHERE generation_id=$1 AND workspace_id=$2 AND doc_id=$3
       RETURNING target_source_version,target_source_exists,target_permission_version,last_error"#,
  )
  .bind(generation_id)
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_one(&mut *connection)
  .await
  .map_err(|error| RuntimeError::database("converge removed search document membership", error))?;
  decode_target(row)
}

fn decode_target(row: sqlx::postgres::PgRow) -> RuntimeResult<DocumentTarget> {
  let last_error: Option<String> = row
    .try_get("last_error")
    .map_err(|error| RuntimeError::database("decode search document failure", error))?;
  Ok(DocumentTarget {
    source_version: row
      .try_get("target_source_version")
      .map_err(|error| RuntimeError::database("decode search document source version", error))?,
    source_exists: row
      .try_get("target_source_exists")
      .map_err(|error| RuntimeError::database("decode search document source existence", error))?,
    permission_version: row
      .try_get("target_permission_version")
      .map_err(|error| RuntimeError::database("decode search document permission version", error))?,
    failed: last_error.as_deref() == Some(DOCUMENT_PROJECTION_FAILED),
  })
}

pub(super) async fn reconcile_documents(
  context: &WorkspaceReconcileContext<'_>,
  permission_version: i64,
  after_doc_id: Option<String>,
  phase: DocumentReconcilePhase,
) -> RuntimeResult<WorkspaceStep> {
  let mut transaction = context
    .pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin document membership reconciliation", error))?;
  let active_doc_ids = active_document_ids(&mut transaction, context.workspace_id).await?;
  let rows = sqlx::query(DOCUMENT_BATCH_SQL)
    .bind(context.workspace_id)
    .bind(context.generation.id)
    .bind(&after_doc_id)
    .bind(RECONCILE_BATCH + 1)
    .bind(&active_doc_ids)
    .fetch_all(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("load active search document batch", error))?;
  let complete = rows.len() <= RECONCILE_BATCH as usize;
  let mut after_doc_id = after_doc_id;
  let mut targets = Vec::with_capacity(rows.len());
  for row in rows.into_iter().take(RECONCILE_BATCH as usize) {
    let doc_id: String = row
      .try_get("doc_id")
      .map_err(|error| RuntimeError::database("decode active search document", error))?;
    let active_member: bool = row
      .try_get("active_member")
      .map_err(|error| RuntimeError::database("decode active membership", error))?;
    let target = converge_document_membership(
      &mut transaction,
      context.generation.id,
      context.workspace_id,
      &doc_id,
      active_member,
    )
    .await?;
    targets.push((doc_id, target));
  }
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit document membership reconciliation", error))?;
  for (doc_id, target) in targets {
    if !renew_workspace_lease(context.pool, context.generation.id, context.workspace_id, context.fence).await? {
      return Ok(WorkspaceStep::Continue(phase.progress(after_doc_id)));
    }
    if target.failed {
      after_doc_id = Some(doc_id);
      continue;
    }
    let matches = if target.source_exists {
      match provider_projection_matches(
        context.pool,
        context.embedded,
        context.remote,
        context.generation,
        ProjectionExpectation {
          workspace_id: context.workspace_id,
          doc_id: &doc_id,
          source_version: target.source_version,
          permission_version: target.permission_version.max(permission_version),
        },
      )
      .await
      {
        Ok(matches) => matches,
        Err(error) if error.is_permanent_search_source() => false,
        Err(error) => return Err(error),
      }
    } else {
      false
    };
    if !matches {
      upsert_document(
        context.pool,
        context.embedded,
        context.remote,
        context.generation,
        context.workspace_id,
        &doc_id,
      )
      .await?;
    }
    after_doc_id = Some(doc_id);
  }
  if complete {
    Ok(WorkspaceStep::Complete)
  } else {
    Ok(WorkspaceStep::Continue(phase.progress(after_doc_id)))
  }
}
