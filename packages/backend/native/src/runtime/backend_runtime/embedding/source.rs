use sqlx::PgPool;
use uuid::Uuid;

use super::{RuntimeError, RuntimeResult, extraction_file_name};
use crate::runtime::{
  storage_runtime::load_current_doc,
  types::{DocumentEmbeddingProjectionInput, RuntimeWorkspaceArtifact},
};

const DOCUMENT_RECIPE: &str = "document-projection-v1";
const ARTIFACT_RECIPE: &str = "artifact-extraction-v1";

pub(super) async fn sync_documents(
  pool: &PgPool,
  workspace_id: &str,
  documents: &[DocumentEmbeddingProjectionInput],
  reconcile: bool,
  priority: i32,
) -> RuntimeResult<()> {
  let live_doc_ids = if reconcile {
    Some(load_live_doc_ids(pool, workspace_id).await?)
  } else {
    None
  };
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("sync document sources transaction failed", error))?;
  for document in documents {
    if document.deleted.unwrap_or(false) {
      sqlx::query(
        "UPDATE embedding_sources SET deleted_at=now(),updated_at=now() WHERE workspace_id=$1 AND \
         source_kind='document' AND source_key=$2",
      )
      .bind(workspace_id)
      .bind(&document.doc_id)
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("delete document embedding source failed", error))?;
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
  }
  if let Some(live_doc_ids) = live_doc_ids {
    reconcile_document_sources(&mut transaction, workspace_id, &live_doc_ids).await?;
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

pub(super) async fn reconcile_documents(pool: &PgPool, workspace_id: &str) -> RuntimeResult<()> {
  let live_doc_ids = load_live_doc_ids(pool, workspace_id).await?;
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("reconcile document sources transaction failed", error))?;
  reconcile_document_sources(&mut transaction, workspace_id, &live_doc_ids).await?;
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("reconcile document sources commit failed", error))?;
  Ok(())
}

async fn load_live_doc_ids(pool: &PgPool, workspace_id: &str) -> RuntimeResult<Vec<String>> {
  let root = load_current_doc(pool, workspace_id, workspace_id)
    .await?
    .ok_or_else(|| RuntimeError::invalid_state("workspace root doc is missing"))?;
  let projection = affine_doc_loader::project_workspace_root(root.blob, true)
    .map_err(|error| RuntimeError::invalid_state(format!("workspace root projection failed: {error}")))?;
  if !projection.complete {
    return Err(RuntimeError::invalid_state("workspace root projection is incomplete"));
  }
  Ok(projection.doc_ids)
}

async fn reconcile_document_sources(
  transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  workspace_id: &str,
  live_doc_ids: &[String],
) -> RuntimeResult<()> {
  let deleted = sqlx::query_scalar::<_, Uuid>(
    r#"UPDATE embedding_sources SET deleted_at=now(),updated_at=now()
    WHERE workspace_id=$1 AND source_kind='document' AND deleted_at IS NULL
      AND NOT(source_key=ANY($2::text[]))
    RETURNING id"#,
  )
  .bind(workspace_id)
  .bind(live_doc_ids)
  .fetch_all(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("reconcile deleted document sources failed", error))?;
  if !deleted.is_empty() {
    sqlx::query("DELETE FROM embedding_projections WHERE source_id=ANY($1::uuid[])")
      .bind(&deleted)
      .execute(&mut **transaction)
      .await
      .map_err(|error| RuntimeError::database("remove deleted document projections failed", error))?;
  }
  let restored = sqlx::query_scalar::<_, Uuid>(
    r#"UPDATE embedding_sources SET deleted_at=NULL,updated_at=now()
    WHERE workspace_id=$1 AND source_kind='document' AND deleted_at IS NOT NULL
      AND source_key=ANY($2::text[])
    RETURNING id"#,
  )
  .bind(workspace_id)
  .bind(live_doc_ids)
  .fetch_all(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("reconcile restored document sources failed", error))?;
  for source_id in restored {
    queue_active_projection(transaction, workspace_id, source_id, 100).await?;
  }
  Ok(())
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
      updated_at=now()"#,
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
