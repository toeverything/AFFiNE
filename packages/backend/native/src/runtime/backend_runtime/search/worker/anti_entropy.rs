use std::collections::{HashMap, HashSet};

use serde_json::{Value, json};
use sqlx::{PgPool, Row};

use super::{
  ActiveGeneration, RECONCILE_BATCH, SearchProvider, SearchTable, WorkspacePhase, WorkspaceReconcileContext,
  WorkspaceStep, mark_workspace_failed, project_document, renew_workspace_lease, upsert_document,
};
use crate::{
  runtime::{RuntimeError, RuntimeResult},
  search_index::EmbeddedSearchIndex,
};

const WORKSPACE_GC_BATCH: usize = 100;
const GENERATION_GC_BATCH: usize = 20;

pub(in crate::runtime::backend_runtime::search) async fn sweep_generation_orphans(
  pool: &PgPool,
  embedded: &EmbeddedSearchIndex,
  remote: Option<&SearchProvider>,
  generation: &ActiveGeneration,
) -> RuntimeResult<()> {
  let (table, cursor): (String, Option<String>) =
    sqlx::query_as("SELECT gc_table,gc_cursor FROM search_projection.generations WHERE id=$1")
      .bind(generation.id)
      .fetch_one(pool)
      .await
      .map_err(|error| RuntimeError::database("load search generation GC progress", error))?;
  let table = match table.as_str() {
    "doc" => SearchTable::Doc,
    "block" => SearchTable::Block,
    _ => return Err(RuntimeError::invalid_state("invalid search generation GC table")),
  };
  let mut dsl = json!({
    "query":{"match_all":{}},
    "fields":["workspace_id"],
    "size":GENERATION_GC_BATCH,
    "sort":provider_page_sort(table, remote.is_some())
  });
  if let Some(cursor) = cursor.as_deref() {
    dsl["cursor"] = json!(cursor);
  }
  let result = search_provider(embedded, remote, generation, table, dsl).await?;
  let workspace_ids = result
    .get("nodes")
    .and_then(Value::as_array)
    .into_iter()
    .flatten()
    .filter_map(|node| provider_field_string(node, "workspace_id"))
    .collect::<HashSet<_>>();
  let existing = sqlx::query_scalar::<_, String>("SELECT id FROM workspaces WHERE id=ANY($1)")
    .bind(workspace_ids.iter().cloned().collect::<Vec<_>>())
    .fetch_all(pool)
    .await
    .map_err(|error| RuntimeError::database("load canonical workspaces for generation GC", error))?
    .into_iter()
    .collect::<HashSet<_>>();
  for workspace_id in workspace_ids.difference(&existing) {
    let Some(source_version_high_water) = capture_orphan_gc_high_water(pool, workspace_id).await? else {
      continue;
    };
    match remote {
      Some(provider) => {
        provider
          .gc_workspace(
            generation.physical_table(table)?,
            workspace_id,
            source_version_high_water,
            WORKSPACE_GC_BATCH,
          )
          .await?;
      }
      None => {
        embedded
          .gc_workspace_for_generation(
            generation.id,
            table.as_str(),
            workspace_id,
            source_version_high_water,
            WORKSPACE_GC_BATCH,
          )
          .await
          .map_err(|error| RuntimeError::invalid_state(format!("embedded generation GC failed: {error}")))?;
      }
    }
  }
  let next_cursor = result.get("nextCursor").and_then(Value::as_str);
  let (next_table, next_cursor) = match next_cursor {
    Some(cursor) => (table.as_str(), Some(cursor)),
    None if table == SearchTable::Doc => (SearchTable::Block.as_str(), None),
    None => (SearchTable::Doc.as_str(), None),
  };
  sqlx::query("UPDATE search_projection.generations SET gc_table=$2,gc_cursor=$3 WHERE id=$1")
    .bind(generation.id)
    .bind(next_table)
    .bind(next_cursor)
    .execute(pool)
    .await
    .map_err(|error| RuntimeError::database("persist search generation GC progress", error))?;
  Ok(())
}

pub(super) async fn capture_orphan_gc_high_water(pool: &PgPool, workspace_id: &str) -> RuntimeResult<Option<i64>> {
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin generation orphan GC fence", error))?;
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('search-projection-generation', 0))")
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("lock generation orphan GC fence", error))?;
  let workspace_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id=$1)")
    .bind(workspace_id)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("confirm generation orphan workspace", error))?;
  let high_water = if workspace_exists {
    None
  } else {
    Some(
      sqlx::query_scalar("SELECT nextval('search_projection.source_mutation_version')")
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| RuntimeError::database("capture generation orphan GC high water", error))?,
    )
  };
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit generation orphan GC fence", error))?;
  Ok(high_water)
}

pub(super) async fn sweep_deleted_workspace(
  context: &WorkspaceReconcileContext<'_>,
  table: SearchTable,
  quiet: bool,
) -> RuntimeResult<WorkspaceStep> {
  if !renew_workspace_lease(context.pool, context.generation.id, context.workspace_id, context.fence).await? {
    return Ok(WorkspaceStep::Continue(WorkspacePhase::Deleted { table, quiet }));
  }
  let Some(source_version_high_water) = capture_orphan_gc_high_water(context.pool, context.workspace_id).await? else {
    return Ok(WorkspaceStep::Complete);
  };
  let may_have_more = match context.remote {
    Some(provider) => {
      provider
        .gc_workspace(
          context.generation.physical_table(table)?,
          context.workspace_id,
          source_version_high_water,
          WORKSPACE_GC_BATCH,
        )
        .await?
    }
    None => context
      .embedded
      .gc_workspace_for_generation(
        context.generation.id,
        table.as_str(),
        context.workspace_id,
        source_version_high_water,
        WORKSPACE_GC_BATCH,
      )
      .await
      .map_err(|error| RuntimeError::invalid_state(format!("embedded search workspace GC failed: {error}")))?,
  };
  if may_have_more {
    return Ok(WorkspaceStep::Continue(WorkspacePhase::Deleted { table, quiet }));
  }
  if table == SearchTable::Doc {
    return Ok(WorkspaceStep::Continue(WorkspacePhase::Deleted {
      table: SearchTable::Block,
      quiet,
    }));
  }
  if !quiet {
    return Ok(WorkspaceStep::Quiet(WorkspacePhase::Deleted {
      table: SearchTable::Doc,
      quiet: true,
    }));
  }
  Ok(WorkspaceStep::Complete)
}

pub(super) const CANONICAL_SNAPSHOT_BATCH_SQL: &str = r#"SELECT snapshot.guid,state.target_source_version,state.target_permission_version
     FROM snapshots snapshot
     LEFT JOIN search_projection.document_states state
       ON state.generation_id=$2 AND state.workspace_id=snapshot.workspace_id AND state.doc_id=snapshot.guid
     WHERE snapshot.workspace_id=$1 AND snapshot.guid <> $1 AND ($3::text IS NULL OR snapshot.guid > $3)
     ORDER BY snapshot.guid LIMIT $4"#;

pub(super) async fn reconcile_stale_provider_rows(
  context: &WorkspaceReconcileContext<'_>,
  table: SearchTable,
  cursor: Option<String>,
) -> RuntimeResult<WorkspaceStep> {
  let pool = context.pool;
  let embedded = context.embedded;
  let remote = context.remote;
  let generation = context.generation;
  let workspace_id = context.workspace_id;
  let workspace_fence = context.fence;
  let (doc_ids, next_cursor) =
    provider_document_page(embedded, remote, generation, workspace_id, table, cursor.as_deref()).await?;
  let doc_ids = doc_ids.into_iter().collect::<HashSet<_>>();
  let rows = sqlx::query(
    r#"SELECT state.doc_id,state.published_source_version,state.published_permission_version,
              state.published_source_exists
       FROM search_projection.document_states state
       WHERE state.generation_id=$1 AND state.workspace_id=$2 AND state.doc_id=ANY($3)
         AND state.target_source_version=state.published_source_version
         AND state.target_source_exists=state.published_source_exists
         AND state.target_permission_version=state.published_permission_version"#,
  )
  .bind(generation.id)
  .bind(workspace_id)
  .bind(doc_ids.iter().cloned().collect::<Vec<_>>())
  .fetch_all(pool)
  .await
  .map_err(|error| RuntimeError::database("load published tuples for search history GC", error))?;
  let published = rows
    .into_iter()
    .map(|row| {
      Ok((
        row
          .try_get::<String, _>("doc_id")
          .map_err(|error| RuntimeError::database("decode search history document", error))?,
        (
          row
            .try_get::<i64, _>("published_source_version")
            .map_err(|error| RuntimeError::database("decode search history source version", error))?,
          row
            .try_get::<i64, _>("published_permission_version")
            .map_err(|error| RuntimeError::database("decode search history permission version", error))?,
          row
            .try_get::<bool, _>("published_source_exists")
            .map_err(|error| RuntimeError::database("decode search history source existence", error))?,
        ),
      ))
    })
    .collect::<RuntimeResult<HashMap<_, _>>>()?;
  for doc_id in doc_ids {
    if !renew_workspace_lease(pool, generation.id, workspace_id, workspace_fence).await? {
      return Ok(WorkspaceStep::Continue(WorkspacePhase::Stale { table, cursor }));
    }
    if let Some((source_version, permission_version, true)) = published.get(&doc_id).copied() {
      let _ = gc_provider_document_history(
        embedded,
        remote,
        generation,
        table,
        ProjectionExpectation {
          workspace_id,
          doc_id: &doc_id,
          source_version,
          permission_version,
        },
      )
      .await;
    } else if let Err(error) = upsert_document(pool, embedded, remote, generation, workspace_id, &doc_id).await {
      if error.is_permanent_search_source() {
        mark_workspace_failed(pool, generation.id, workspace_id, workspace_fence).await?;
        return Ok(WorkspaceStep::Failed);
      }
      return Err(error);
    }
  }
  if let Some(next_cursor) = next_cursor {
    return Ok(WorkspaceStep::Continue(WorkspacePhase::Stale {
      table,
      cursor: Some(next_cursor),
    }));
  }
  if table == SearchTable::Doc {
    return Ok(WorkspaceStep::Continue(WorkspacePhase::Stale {
      table: SearchTable::Block,
      cursor: None,
    }));
  }
  Ok(WorkspaceStep::Complete)
}

async fn gc_provider_document_history(
  embedded: &EmbeddedSearchIndex,
  remote: Option<&SearchProvider>,
  generation: &ActiveGeneration,
  table: SearchTable,
  published: ProjectionExpectation<'_>,
) -> RuntimeResult<()> {
  let ProjectionExpectation {
    workspace_id,
    doc_id,
    source_version,
    permission_version,
  } = published;
  match remote {
    Some(provider) => {
      provider
        .gc_document_history(
          generation.physical_table(table)?,
          workspace_id,
          doc_id,
          source_version,
          permission_version,
          WORKSPACE_GC_BATCH,
        )
        .await
    }
    None => embedded
      .gc_document_history_for_generation(
        generation.id,
        table.as_str(),
        workspace_id,
        doc_id,
        (source_version, permission_version),
        WORKSPACE_GC_BATCH,
      )
      .await
      .map_err(|error| RuntimeError::invalid_state(format!("embedded search history GC failed: {error}"))),
  }
}

async fn provider_document_page(
  embedded: &EmbeddedSearchIndex,
  remote: Option<&SearchProvider>,
  generation: &ActiveGeneration,
  workspace_id: &str,
  table: SearchTable,
  cursor: Option<&str>,
) -> RuntimeResult<(Vec<String>, Option<String>)> {
  let mut dsl = json!({
    "query":{"term":{"workspace_id":{"value":workspace_id}}},
    "fields":["doc_id"],
    "size":RECONCILE_BATCH,
    "sort":provider_page_sort(table, remote.is_some())
  });
  if let Some(cursor) = cursor {
    dsl["cursor"] = json!(cursor);
  }
  let result = search_provider(embedded, remote, generation, table, dsl).await?;
  let doc_ids = result
    .get("nodes")
    .and_then(Value::as_array)
    .into_iter()
    .flatten()
    .filter_map(|node| provider_field_string(node, "doc_id"))
    .collect();
  let next_cursor = result.get("nextCursor").and_then(Value::as_str).map(str::to_string);
  Ok((doc_ids, next_cursor))
}

fn provider_page_sort(table: SearchTable, remote: bool) -> Value {
  if !remote {
    return json!(["doc_id", "id"]);
  }
  let mut fields = vec!["workspace_id", "doc_id", "source_version", "permission_version"];
  if table == SearchTable::Block {
    fields.push("block_id");
  }
  json!(fields.into_iter().map(|field| json!({field:"asc"})).collect::<Vec<_>>())
}

fn provider_field_string(node: &Value, field: &str) -> Option<String> {
  node
    .pointer(&format!("/fields/{field}/0"))
    .and_then(Value::as_str)
    .or_else(|| node.pointer(&format!("/_source/{field}")).and_then(Value::as_str))
    .map(str::to_string)
}

async fn search_provider(
  embedded: &EmbeddedSearchIndex,
  remote: Option<&SearchProvider>,
  generation: &ActiveGeneration,
  table: SearchTable,
  dsl: Value,
) -> RuntimeResult<Value> {
  match remote {
    Some(remote) => remote.search(generation.physical_table(table)?, dsl).await,
    None => {
      let result = embedded
        .search_for_generation(generation.id, table.as_str().to_string(), dsl.to_string())
        .await
        .map_err(|error| RuntimeError::invalid_state(format!("embedded search lookup failed: {error}")))?;
      serde_json::from_str(&result).map_err(|error| RuntimeError::json("decode embedded search", error))
    }
  }
}

pub(super) struct ProjectionExpectation<'a> {
  pub(super) workspace_id: &'a str,
  pub(super) doc_id: &'a str,
  pub(super) source_version: i64,
  pub(super) permission_version: i64,
}

pub(super) async fn provider_projection_matches(
  pool: &PgPool,
  embedded: &EmbeddedSearchIndex,
  remote: Option<&SearchProvider>,
  generation: &ActiveGeneration,
  expected: ProjectionExpectation<'_>,
) -> RuntimeResult<bool> {
  let ProjectionExpectation {
    workspace_id,
    doc_id,
    source_version,
    permission_version,
  } = expected;
  let dsl = json!({
    "_source":["source_version","permission_version"],
    "fields":["source_version","permission_version"],
    "query":{"bool":{"must":[
      {"term":{"workspace_id":{"value":workspace_id}}},
      {"term":{"doc_id":{"value":doc_id}}},
      {"term":{"source_version":{"value":source_version}}},
      {"term":{"permission_version":{"value":permission_version}}}
    ]}},
    "size":1,
  });
  let result = search_provider(embedded, remote, generation, SearchTable::Doc, dsl).await?;
  let Some(node) = result
    .get("nodes")
    .and_then(Value::as_array)
    .and_then(|nodes| nodes.first())
  else {
    return Ok(false);
  };
  let Some(provider_source_version) = provider_field_i64(node, "source_version") else {
    return Ok(false);
  };
  let Some(provider_permission_version) = provider_field_i64(node, "permission_version") else {
    return Ok(false);
  };
  if provider_source_version != source_version || provider_permission_version != permission_version {
    return Ok(false);
  }

  let Some((_, blocks)) = project_document(pool, workspace_id, doc_id).await? else {
    return Ok(false);
  };
  let expected_block_ids = blocks
    .iter()
    .filter_map(|block| block.payload.get("block_id").and_then(Value::as_str))
    .map(str::to_string)
    .collect::<HashSet<_>>();
  let block_result = search_provider(
    embedded,
    remote,
    generation,
    SearchTable::Block,
    json!({
      "_source":["block_id","source_version","permission_version"],
      "fields":["block_id","source_version","permission_version"],
      "query":{"bool":{"must":[
        {"term":{"workspace_id":{"value":workspace_id}}},
        {"term":{"doc_id":{"value":doc_id}}},
        {"term":{"source_version":{"value":source_version}}},
        {"term":{"permission_version":{"value":permission_version}}}
      ]}},
      "size":expected_block_ids.len().saturating_add(1),
    }),
  )
  .await?;
  let nodes = block_result
    .get("nodes")
    .and_then(Value::as_array)
    .cloned()
    .unwrap_or_default();
  Ok(provider_block_projection_matches(
    &nodes,
    &expected_block_ids,
    source_version,
    permission_version,
  ))
}

pub(super) fn provider_block_projection_matches(
  nodes: &[Value],
  expected_block_ids: &HashSet<String>,
  source_version: i64,
  permission_version: i64,
) -> bool {
  if nodes.len() != expected_block_ids.len() {
    return false;
  }
  let actual_block_ids = nodes
    .iter()
    .filter_map(|node| {
      let block_id = provider_field_string(node, "block_id")?;
      let version = provider_field_i64(node, "source_version")?;
      let provider_permission_version = provider_field_i64(node, "permission_version")?;
      (version == source_version && provider_permission_version == permission_version).then_some(block_id)
    })
    .collect::<HashSet<_>>();
  actual_block_ids == *expected_block_ids
}

fn provider_field_i64(node: &Value, field: &str) -> Option<i64> {
  node
    .pointer(&format!("/fields/{field}/0"))
    .and_then(Value::as_i64)
    .or_else(|| node.pointer(&format!("/_source/{field}")).and_then(Value::as_i64))
}

pub(super) async fn reconcile_source_documents(
  context: &WorkspaceReconcileContext<'_>,
  permission_version: i64,
  after_doc_id: Option<String>,
) -> RuntimeResult<WorkspaceStep> {
  let pool = context.pool;
  let embedded = context.embedded;
  let remote = context.remote;
  let generation = context.generation;
  let workspace_id = context.workspace_id;
  let workspace_fence = context.fence;
  let rows = sqlx::query(CANONICAL_SNAPSHOT_BATCH_SQL)
    .bind(workspace_id)
    .bind(generation.id)
    .bind(&after_doc_id)
    .bind(RECONCILE_BATCH + 1)
    .fetch_all(pool)
    .await
    .map_err(|error| RuntimeError::database("load anti-entropy search source batch", error))?;
  let complete = rows.len() <= RECONCILE_BATCH as usize;
  let mut after_doc_id = after_doc_id;
  for row in rows.into_iter().take(RECONCILE_BATCH as usize) {
    let doc_id: String = row
      .try_get("guid")
      .map_err(|error| RuntimeError::database("decode anti-entropy search source document", error))?;
    let source_version: Option<i64> = row
      .try_get("target_source_version")
      .map_err(|error| RuntimeError::database("decode anti-entropy search source version", error))?;
    let target_permission_version: Option<i64> = row
      .try_get("target_permission_version")
      .map_err(|error| RuntimeError::database("decode anti-entropy search permission version", error))?;
    if !renew_workspace_lease(pool, generation.id, workspace_id, workspace_fence).await? {
      return Ok(WorkspaceStep::Continue(WorkspacePhase::Source { after_doc_id }));
    }
    let projection_result = match (source_version, target_permission_version) {
      (Some(source_version), Some(target_permission_version)) => {
        provider_projection_matches(
          pool,
          embedded,
          remote,
          generation,
          ProjectionExpectation {
            workspace_id,
            doc_id: &doc_id,
            source_version,
            permission_version: target_permission_version.max(permission_version),
          },
        )
        .await
      }
      _ => Ok(false),
    };
    let projection_matches = match projection_result {
      Ok(matches) => matches,
      Err(error) if error.is_permanent_search_source() => {
        mark_workspace_failed(pool, generation.id, workspace_id, workspace_fence).await?;
        return Ok(WorkspaceStep::Failed);
      }
      Err(error) => return Err(error),
    };
    if !projection_matches {
      if !renew_workspace_lease(pool, generation.id, workspace_id, workspace_fence).await? {
        return Ok(WorkspaceStep::Continue(WorkspacePhase::Source { after_doc_id }));
      }
      if let Err(error) = upsert_document(pool, embedded, remote, generation, workspace_id, &doc_id).await {
        if error.is_permanent_search_source() {
          mark_workspace_failed(pool, generation.id, workspace_id, workspace_fence).await?;
          return Ok(WorkspaceStep::Failed);
        }
        return Err(error);
      }
    }
    after_doc_id = Some(doc_id);
  }
  if complete {
    Ok(WorkspaceStep::Complete)
  } else {
    Ok(WorkspaceStep::Continue(WorkspacePhase::Source { after_doc_id }))
  }
}

#[cfg(test)]
mod tests {
  use serde_json::json;

  use super::*;

  #[test]
  fn anti_entropy_provider_contracts_are_stable() {
    let expected = HashSet::from(["one".to_string(), "two".to_string()]);
    let complete = vec![
      json!({"_source":{"block_id":"one","source_version":7,"permission_version":3}}),
      json!({"_source":{"block_id":"two","source_version":7,"permission_version":3}}),
    ];
    assert!(provider_block_projection_matches(&complete, &expected, 7, 3));
    assert!(!provider_block_projection_matches(&complete[..1], &expected, 7, 3));
    assert!(!provider_block_projection_matches(
      &[
        json!({"_source":{"block_id":"one","source_version":7,"permission_version":3}}),
        json!({"_source":{"block_id":"two","source_version":6,"permission_version":3}}),
      ],
      &expected,
      7,
      3,
    ));
    assert_eq!(
      provider_page_sort(SearchTable::Doc, true),
      json!([
        {"workspace_id":"asc"},
        {"doc_id":"asc"},
        {"source_version":"asc"},
        {"permission_version":"asc"}
      ])
    );
    assert_eq!(provider_page_sort(SearchTable::Block, false), json!(["doc_id", "id"]));
  }
}
