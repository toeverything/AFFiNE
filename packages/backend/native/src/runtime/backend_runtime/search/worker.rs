use sqlx::PgPool;
use tokio::sync::RwLock;

use super::{
  generation::ActiveGeneration,
  provider::RemoteProvider,
  store::{SearchChange, SearchStore, SearchTable},
};
use crate::{
  runtime::{RuntimeError, RuntimeResult},
  search_index::EmbeddedSearchIndex,
};

pub(super) async fn rebuild(
  pool: &PgPool,
  store: &SearchStore,
  embedded: &EmbeddedSearchIndex,
  remote: Option<&RemoteProvider>,
  generation: &ActiveGeneration,
  embedded_cursors: &RwLock<[i64; 2]>,
  restore_checkpoint: bool,
) -> RuntimeResult<()> {
  for table in SearchTable::ORDERED {
    if restore_checkpoint
      && remote.is_none()
      && let Some(cursor) = super::checkpoint::restore(pool, embedded, table).await?
    {
      set_cursor(pool, remote, generation, embedded_cursors, table, cursor).await?;
      continue;
    }
    let snapshot = store.snapshot(table).await?;
    if let Some(remote) = remote {
      let changes = snapshot
        .projections
        .into_iter()
        .enumerate()
        .map(|(offset, projection)| SearchChange {
          sequence: offset as i64 + 1,
          external_id: projection.external_id,
          workspace_id: projection.workspace_id,
          doc_id: Some(projection.doc_id),
          revision: projection.revision,
          operation: "upsert".into(),
          payload: Some(projection.payload),
        })
        .collect::<Vec<_>>();
      for batch in changes.chunks(1000) {
        remote
          .apply(generation.physical_table(runtime_table(table))?, batch)
          .await?;
      }
    } else {
      embedded.reset(table.as_str().to_string()).await?;
      for documents in snapshot.projections.chunks(1000) {
        embedded
          .write(
            table.as_str().to_string(),
            serde_json::to_string(
              &documents
                .iter()
                .map(|projection| super::provider_payload(&projection.payload))
                .collect::<Vec<_>>(),
            )
            .map_err(|error| RuntimeError::json("encode embedded snapshot", error))?,
          )
          .await?;
      }
    }
    set_cursor(pool, remote, generation, embedded_cursors, table, snapshot.head).await?;
  }
  sync(pool, store, embedded, remote, generation, embedded_cursors).await?;
  Ok(())
}

pub(super) async fn sync(
  pool: &PgPool,
  store: &SearchStore,
  embedded: &EmbeddedSearchIndex,
  remote: Option<&RemoteProvider>,
  generation: &ActiveGeneration,
  embedded_cursors: &RwLock<[i64; 2]>,
) -> RuntimeResult<()> {
  for table in SearchTable::ORDERED {
    loop {
      let cursor = cursor(pool, remote, generation, embedded_cursors, table).await?;
      let (head, changes) = store.changes(table, cursor, 1000).await?;
      if changes.is_empty() {
        if cursor < head {
          return Err(RuntimeError::invalid_state(
            "search provider cursor did not reach stream head",
          ));
        }
        break;
      }
      if let Some(remote) = remote {
        remote
          .apply(generation.physical_table(runtime_table(table))?, &changes)
          .await?;
      } else {
        apply_embedded(embedded, table, &changes).await?;
      }
      set_cursor(
        pool,
        remote,
        generation,
        embedded_cursors,
        table,
        changes.last().expect("non-empty changes").sequence,
      )
      .await?;
    }
  }
  if remote.is_none() {
    super::checkpoint::persist(pool, embedded, *embedded_cursors.read().await).await?;
  } else {
    super::checkpoint::gc(pool).await?;
  }
  Ok(())
}

async fn apply_embedded(
  embedded: &EmbeddedSearchIndex,
  table: SearchTable,
  changes: &[SearchChange],
) -> RuntimeResult<()> {
  let upserts = changes
    .iter()
    .filter_map(|change| change.payload.as_ref().map(super::provider_payload))
    .collect::<Vec<_>>();
  if !upserts.is_empty() {
    embedded
      .write(
        table.as_str().to_string(),
        serde_json::to_string(&upserts).map_err(|error| RuntimeError::json("encode embedded changes", error))?,
      )
      .await?;
  }
  for change in changes.iter().filter(|change| change.operation == "delete") {
    embedded
      .delete(table.as_str().to_string(), change.external_id.clone())
      .await?;
  }
  Ok(())
}

async fn set_cursor(
  pool: &PgPool,
  remote: Option<&RemoteProvider>,
  generation: &ActiveGeneration,
  embedded_cursors: &RwLock<[i64; 2]>,
  table: SearchTable,
  cursor: i64,
) -> RuntimeResult<()> {
  if remote.is_none() {
    let mut cursors = embedded_cursors.write().await;
    cursors[table.cursor_index()] = cursors[table.cursor_index()].max(cursor);
    return Ok(());
  }
  sqlx::query(
    "UPDATE search_runtime_provider_cursors SET source_cursor=GREATEST(source_cursor,$3), updated_at=now() WHERE \
     generation_id=$1 AND table_key=$2",
  )
  .bind(generation.id)
  .bind(table.as_str())
  .bind(cursor)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("advance search provider cursor", error))?;
  Ok(())
}

async fn cursor(
  pool: &PgPool,
  remote: Option<&RemoteProvider>,
  generation: &ActiveGeneration,
  embedded_cursors: &RwLock<[i64; 2]>,
  table: SearchTable,
) -> RuntimeResult<i64> {
  if remote.is_none() {
    return Ok(embedded_cursors.read().await[table.cursor_index()]);
  }
  sqlx::query_scalar(
    "SELECT source_cursor FROM search_runtime_provider_cursors WHERE generation_id=$1 AND table_key=$2",
  )
  .bind(generation.id)
  .bind(table.as_str())
  .fetch_one(pool)
  .await
  .map_err(|error| RuntimeError::database("load search provider cursor", error))
}

fn runtime_table(table: SearchTable) -> super::types::SearchTable {
  match table {
    SearchTable::Doc => super::types::SearchTable::Doc,
    SearchTable::Block => super::types::SearchTable::Block,
  }
}
