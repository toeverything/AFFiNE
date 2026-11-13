use sqlx::PgPool;
use uuid::Uuid;

use super::{
  RuntimeError, RuntimeResult, extraction_file_name, is_ordinary_workspace_doc, load_doc_states_in,
  lock_workspace_doc_update, lock_workspace_storage_shared,
};
use crate::runtime::types::{DocumentEmbeddingProjectionInput, RuntimeWorkspaceArtifact};

const DOCUMENT_RECIPE: &str = "document-projection-v1";
const ARTIFACT_RECIPE: &str = "artifact-extraction-v1";

pub(super) async fn sync_documents(
  pool: &PgPool,
  workspace_id: &str,
  documents: &[DocumentEmbeddingProjectionInput],
  priority: i32,
) -> RuntimeResult<()> {
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("sync document sources transaction failed", error))?;
  lock_workspace_storage_shared(&mut transaction, workspace_id).await?;
  let mut doc_ids = documents.iter().map(|doc| doc.doc_id.clone()).collect::<Vec<_>>();
  doc_ids.sort_unstable();
  doc_ids.dedup();
  for doc_id in &doc_ids {
    lock_workspace_doc_update(&mut transaction, workspace_id, doc_id).await?;
  }
  let states = load_doc_states_in(&mut transaction, workspace_id, &doc_ids)
    .await?
    .into_iter()
    .filter(|doc| doc.lifecycle.is_none() && is_ordinary_workspace_doc(workspace_id, &doc.doc_id))
    .map(|doc| (doc.doc_id.clone(), doc))
    .collect::<std::collections::BTreeMap<_, _>>();
  for document in documents {
    if !states
      .get(&document.doc_id)
      .is_some_and(|state| state.timestamp.timestamp_millis().to_string() == document.revision)
    {
      continue;
    }
    let projection =
      serde_json::to_value(document).map_err(|_| RuntimeError::invalid_input("document_projection_invalid"))?;
    let source_id = sqlx::query_scalar::<_, Uuid>(
      r#"INSERT INTO embedding_sources(
        id,workspace_id,source_kind,source_key,content_revision,descriptor_revision,
        recipe_revision,document_projection,deleted_at
      ) VALUES($1,$2,'document',$3,$4,$5,$6,$7,NULL)
      ON CONFLICT(workspace_id,source_kind,source_key) DO UPDATE SET
        content_revision=excluded.content_revision,
        descriptor_revision=excluded.descriptor_revision,
        recipe_revision=excluded.recipe_revision,
        document_projection=excluded.document_projection,
        deleted_at=NULL,
        updated_at=now()
      RETURNING id"#,
    )
    .bind(Uuid::new_v4())
    .bind(workspace_id)
    .bind(&document.doc_id)
    .bind(&document.revision)
    .bind(&document.source_hash)
    .bind(DOCUMENT_RECIPE)
    .bind(projection)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("upsert document embedding source failed", error))?;
    queue_active_projection(&mut transaction, workspace_id, source_id, priority).await?;
    if let Some(reason) = &document.skip_reason {
      sqlx::query(
        "UPDATE embedding_projections SET \
         status='failed',last_error_code=$2,last_error_detail=NULL,lease_owner=NULL,lease_until=NULL,\
         lease_token=lease_token+1,updated_at=now() WHERE source_id=$1",
      )
      .bind(source_id)
      .bind(reason)
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("record skipped document projection failed", error))?;
    }
  }
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("sync document sources commit failed", error))?;
  Ok(())
}

pub(super) async fn document_readiness(
  pool: &PgPool,
  workspace_id: &str,
  documents: &[DocumentEmbeddingProjectionInput],
) -> RuntimeResult<(i64, i64)> {
  let doc_ids = documents
    .iter()
    .map(|document| document.doc_id.as_str())
    .collect::<Vec<_>>();
  let revisions = documents
    .iter()
    .map(|document| document.revision.as_str())
    .collect::<Vec<_>>();
  sqlx::query_as(
    r#"WITH requested AS(
      SELECT * FROM unnest($2::text[],$3::text[]) AS item(doc_id,revision)
    ) SELECT
      count(*) FILTER(WHERE projection.status='ready'
        AND projection.applied_content_revision=requested.revision)::bigint AS ready,
      count(*) FILTER(WHERE projection.status='failed')::bigint AS failed
    FROM requested
    LEFT JOIN embedding_sources source ON source.workspace_id=$1
      AND source.source_kind='document' AND source.source_key=requested.doc_id
      AND source.content_revision=requested.revision AND source.deleted_at IS NULL
    LEFT JOIN embedding_workspace_states state ON state.workspace_id=$1
      AND state.runtime_state='active'
    LEFT JOIN embedding_projections projection ON projection.source_id=source.id
      AND projection.index_id=state.active_index_id"#,
  )
  .bind(workspace_id)
  .bind(doc_ids)
  .bind(revisions)
  .fetch_one(pool)
  .await
  .map_err(|error| RuntimeError::database("load document embedding readiness failed", error))
}

pub(super) async fn register_artifact(pool: &PgPool, artifact: &RuntimeWorkspaceArtifact) -> RuntimeResult<()> {
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("register artifact source transaction failed", error))?;
  let file_name = artifact
    .file_name
    .clone()
    .unwrap_or_else(|| extraction_file_name(&artifact.canonical_media_type));
  let descriptor_revision = format!("{}:{}:{file_name}", artifact.canonical_media_type, artifact.size);
  let source_id = sqlx::query_scalar::<_, Uuid>(
    r#"INSERT INTO embedding_sources(
      id,workspace_id,source_kind,source_key,content_revision,descriptor_revision,
      recipe_revision,storage_scope,storage_key,file_name,mime_type,size_bytes,deleted_at
    ) VALUES($1,$2,'artifact',$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL)
    ON CONFLICT(workspace_id,source_kind,source_key) DO UPDATE SET
      content_revision=excluded.content_revision,
      descriptor_revision=excluded.descriptor_revision,
      recipe_revision=excluded.recipe_revision,
      storage_scope=excluded.storage_scope,
      storage_key=excluded.storage_key,
      file_name=excluded.file_name,
      mime_type=excluded.mime_type,
      size_bytes=excluded.size_bytes,
      deleted_at=NULL,
      updated_at=now()
    RETURNING id"#,
  )
  .bind(Uuid::new_v4())
  .bind(&artifact.workspace_id)
  .bind(&artifact.id)
  .bind(&artifact.content_hash)
  .bind(descriptor_revision)
  .bind(ARTIFACT_RECIPE)
  .bind(&artifact.storage_scope)
  .bind(&artifact.storage_key)
  .bind(file_name)
  .bind(&artifact.canonical_media_type)
  .bind(artifact.size)
  .fetch_one(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("upsert artifact embedding source failed", error))?;
  queue_active_projection(&mut transaction, &artifact.workspace_id, source_id, 200).await?;
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("register artifact source commit failed", error))?;
  Ok(())
}

async fn queue_active_projection(
  transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  workspace_id: &str,
  source_id: Uuid,
  priority: i32,
) -> RuntimeResult<()> {
  sqlx::query(
    r#"INSERT INTO embedding_projections(source_id,index_id,status,priority)
    SELECT $2,active_index_id,'pending',$3 FROM embedding_workspace_states
    WHERE workspace_id=$1 AND active_index_id IS NOT NULL
    ON CONFLICT(source_id,index_id) DO UPDATE SET
      status=CASE WHEN embedding_projections.status='running' THEN 'running' ELSE 'pending' END,
      priority=excluded.priority,
      updated_at=now()
    WHERE embedding_projections.status<>'ready'"#,
  )
  .bind(workspace_id)
  .bind(source_id)
  .bind(priority)
  .execute(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("queue embedding projection failed", error))?;
  Ok(())
}

pub(super) async fn reconcile_artifacts(pool: &PgPool) -> RuntimeResult<u64> {
  sqlx::query(
    r#"UPDATE embedding_sources source SET deleted_at=now(),updated_at=now()
    WHERE source.source_kind='artifact' AND source.deleted_at IS NULL AND NOT EXISTS(
      SELECT 1 FROM workspace_artifacts artifact
      WHERE artifact.workspace_id=source.workspace_id
        AND artifact.id::text=source.source_key
        AND artifact.status='ready'
    )"#,
  )
  .execute(pool)
  .await
  .map(|result| result.rows_affected())
  .map_err(|error| RuntimeError::database("reconcile artifact embedding sources failed", error))
}
