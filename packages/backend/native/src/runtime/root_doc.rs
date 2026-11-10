use affine_core::access_control::classify_reserved_document;
use affine_doc_loader::WorkspaceRootProjection;
use sqlx::PgConnection;
use y_octo::Doc;

use super::{CurrentDoc, CurrentDocUpdate, RuntimeError, RuntimeResult, load_current_doc_parts_in};

pub(in crate::runtime) struct LoadedRoot {
  pub(in crate::runtime) doc: Doc,
  pub(in crate::runtime) snapshot_exists: bool,
  pub(in crate::runtime) exists: bool,
}

pub(in crate::runtime) async fn load_root(
  connection: &mut PgConnection,
  workspace_id: &str,
) -> RuntimeResult<LoadedRoot> {
  let (snapshot, updates) = load_current_doc_parts_in(connection, workspace_id, workspace_id).await?;
  load_root_parts(snapshot.as_ref(), &updates)
}

pub(in crate::runtime) fn load_root_parts(
  snapshot: Option<&CurrentDoc>,
  updates: &[CurrentDocUpdate],
) -> RuntimeResult<LoadedRoot> {
  let snapshot_exists = snapshot.is_some();
  let exists = snapshot_exists || !updates.is_empty();
  let mut doc = Doc::default();
  if exists {
    let merged = y_octo::merge_updates_v1(
      snapshot
        .iter()
        .map(|snapshot| snapshot.blob.as_slice())
        .chain(updates.iter().map(|update| update.blob.as_slice())),
    )
    .map_err(|_| RuntimeError::invalid_state("doc_root_source_invalid"))?;
    doc
      .apply_update(merged)
      .map_err(|_| RuntimeError::invalid_state("doc_root_source_invalid"))?;
  }
  Ok(LoadedRoot {
    doc,
    snapshot_exists,
    exists,
  })
}

pub(in crate::runtime) fn project_root(doc: &Doc) -> RuntimeResult<WorkspaceRootProjection> {
  affine_doc_loader::project_workspace_root_doc(doc).map_err(|_| RuntimeError::invalid_state("doc_root_source_invalid"))
}

pub(in crate::runtime) fn require_complete_root(doc: &Doc) -> RuntimeResult<WorkspaceRootProjection> {
  let projection = project_root(doc)?;
  if !projection.complete {
    return Err(RuntimeError::invalid_state("doc_root_source_invalid"));
  }
  Ok(projection)
}

pub(in crate::runtime) async fn root_was_initialized(
  connection: &mut PgConnection,
  workspace_id: &str,
) -> RuntimeResult<bool> {
  let recorded = sqlx::query_scalar::<_, bool>(
    "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints WHERE kind='workspace_root_source' AND scope=$1 \
     AND metadata->>'initialized'='true') OR EXISTS(SELECT 1 FROM snapshot_histories WHERE workspace_id=$1 AND \
     guid=$1)",
  )
  .bind(workspace_id)
  .fetch_one(&mut *connection)
  .await
  .map_err(|error| RuntimeError::database("load root initialization evidence", error))?;
  if recorded {
    return Ok(true);
  }
  let doc_ids = sqlx::query_scalar::<_, String>(
    "SELECT guid FROM snapshots WHERE workspace_id=$1 AND guid<>$1 UNION SELECT guid FROM updates WHERE \
     workspace_id=$1 AND guid<>$1",
  )
  .bind(workspace_id)
  .fetch_all(&mut *connection)
  .await
  .map_err(|error| RuntimeError::database("load root document initialization evidence", error))?;
  Ok(
    doc_ids
      .iter()
      .any(|doc_id| !classify_reserved_document(workspace_id, doc_id).is_valid_reserved()),
  )
}
