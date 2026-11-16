pub(in crate::runtime) use affine_core::access_control::is_ordinary_workspace_doc;
use chrono::{DateTime, Utc};
use sqlx::PgConnection;

use super::{RuntimeError, RuntimeResult};

#[derive(sqlx::FromRow)]
pub(in crate::runtime) struct WorkspaceDocState {
  pub(in crate::runtime) doc_id: String,
  pub(in crate::runtime) timestamp: DateTime<Utc>,
  pub(in crate::runtime) lifecycle: Option<String>,
  pub(in crate::runtime) lifecycle_changed_at: Option<DateTime<Utc>>,
}

pub(in crate::runtime) async fn load_workspace_doc_states_in(
  connection: &mut PgConnection,
  workspace_id: &str,
) -> RuntimeResult<Vec<WorkspaceDocState>> {
  load_workspace_doc_states_page_in(connection, workspace_id, None, false, None).await
}

pub(in crate::runtime) async fn load_workspace_doc_states_page_in(
  connection: &mut PgConnection,
  workspace_id: &str,
  cursor: Option<&str>,
  include_cursor: bool,
  limit: Option<i64>,
) -> RuntimeResult<Vec<WorkspaceDocState>> {
  load_states_in(connection, workspace_id, cursor, include_cursor, limit, None).await
}

pub(in crate::runtime) async fn load_doc_states_in(
  connection: &mut PgConnection,
  workspace_id: &str,
  doc_ids: &[String],
) -> RuntimeResult<Vec<WorkspaceDocState>> {
  load_states_in(connection, workspace_id, None, false, None, Some(doc_ids)).await
}

async fn load_states_in(
  connection: &mut PgConnection,
  workspace_id: &str,
  cursor: Option<&str>,
  include_cursor: bool,
  limit: Option<i64>,
  doc_ids: Option<&[String]>,
) -> RuntimeResult<Vec<WorkspaceDocState>> {
  sqlx::query_as(
    "SELECT source.doc_id,source.timestamp,page.lifecycle_state::text AS lifecycle,page.lifecycle_changed_at FROM \
     (SELECT guid AS doc_id,max(timestamp) AS timestamp FROM (SELECT guid,updated_at AS timestamp FROM snapshots \
     WHERE workspace_id=$1 AND ($5::text[] IS NULL OR guid=ANY($5)) UNION ALL SELECT guid,created_at AS timestamp \
     FROM updates WHERE workspace_id=$1 AND ($5::text[] IS NULL OR guid=ANY($5))) records GROUP BY guid) source LEFT \
     JOIN workspace_pages page ON page.workspace_id=$1 AND page.page_id=source.doc_id WHERE page.lifecycle_state IS \
     DISTINCT FROM 'deleted' AND ($2::text IS NULL OR source.doc_id > $2 OR ($3 AND source.doc_id = $2)) ORDER BY \
     source.doc_id LIMIT $4",
  )
  .bind(workspace_id)
  .bind(cursor)
  .bind(include_cursor)
  .bind(limit)
  .bind(doc_ids)
  .fetch_all(connection)
  .await
  .map_err(|error| RuntimeError::database("load workspace document states", error))
}

pub(in crate::runtime) async fn ensure_doc_not_deleted_in(
  connection: &mut PgConnection,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<()> {
  let deleted: bool = sqlx::query_scalar(
    "SELECT EXISTS(SELECT 1 FROM workspace_pages WHERE workspace_id=$1 AND page_id=$2 AND lifecycle_state='deleted')",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_one(connection)
  .await
  .map_err(|error| RuntimeError::database("load document tombstone", error))?;
  if deleted {
    return Err(RuntimeError::invalid_input("doc_not_found"));
  }
  Ok(())
}

pub(in crate::runtime) async fn ensure_workspace_sync_protocol_in(
  connection: &mut PgConnection,
  workspace_id: &str,
  protocol_version: Option<u32>,
) -> RuntimeResult<()> {
  if protocol_version == Some(2) {
    return Ok(());
  }
  let migrated: bool = sqlx::query_scalar(
    "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints WHERE kind='workspace_doc_lifecycle' AND scope=$1 \
     AND status='completed')",
  )
  .bind(workspace_id)
  .fetch_one(connection)
  .await
  .map_err(|error| RuntimeError::database("load workspace sync protocol", error))?;
  if migrated {
    return Err(RuntimeError::invalid_input("sync_protocol_upgrade_required"));
  }
  Ok(())
}
