use std::{
  collections::{BTreeMap, BTreeSet},
  sync::atomic::Ordering,
};

use sqlx::Row;
use tokio::time::Instant;

use super::{
  ActiveGeneration, DocReadScope, RuntimeAggregateRequest, RuntimeSearchRequest, SearchActor, SearchRuntime,
  SearchTable, candidates, compile, compile_aggregate, retain_visible_nodes,
};
use crate::runtime::{RuntimeError, RuntimeResult};

const SEARCH_CANDIDATE_PAGE_BUDGET: usize = 3;

impl SearchRuntime {
  pub(in crate::runtime::backend_runtime) async fn search_authorized(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    request: RuntimeSearchRequest,
  ) -> RuntimeResult<serde_json::Value> {
    let request = request.into_search_request()?;
    for attempt in 0..=1 {
      let scope = self
        .authorizer
        .authorize_search(
          &SearchActor::User {
            user_id: actor_user_id.to_string(),
          },
          workspace_id,
        )
        .await?;
      let (generation, required_permission_version) = self.query_gate(workspace_id).await?;
      let dsl = compile(&request, &scope)?;
      let result = self
        .execute_visible_search(
          &generation,
          workspace_id,
          actor_user_id,
          &scope.docs,
          request.table,
          dsl,
        )
        .await?;
      if self
        .query_snapshot_is_current(workspace_id, generation.id, required_permission_version)
        .await?
      {
        return Ok(result);
      }
      if attempt == 1 {
        return Err(RuntimeError::SearchPermissionSyncing);
      }
    }
    unreachable!()
  }

  pub(super) async fn execute_visible_search(
    &self,
    generation: &ActiveGeneration,
    workspace_id: &str,
    actor_user_id: &str,
    scope: &DocReadScope,
    table: SearchTable,
    mut dsl: serde_json::Value,
  ) -> RuntimeResult<serde_json::Value> {
    let limit = dsl.get("size").and_then(serde_json::Value::as_u64).unwrap_or(10) as usize;
    let mut result = serde_json::json!({"total":0,"nodes":[],"nextCursor":null});
    for _ in 0..SEARCH_CANDIDATE_PAGE_BUDGET {
      let mut page = self.execute_search(generation, table, dsl.clone()).await?;
      self
        .retain_canonically_visible(generation, workspace_id, actor_user_id, scope, &mut page)
        .await?;
      let next_cursor = page.get("nextCursor").cloned().unwrap_or(serde_json::Value::Null);
      let nodes = page
        .get_mut("nodes")
        .and_then(serde_json::Value::as_array_mut)
        .ok_or_else(|| RuntimeError::invalid_state("invalid provider response"))?;
      result["nodes"]
        .as_array_mut()
        .expect("search result nodes are initialized")
        .append(nodes);
      let returned = result["nodes"]
        .as_array()
        .expect("search result nodes are initialized")
        .len();
      result["total"] = serde_json::json!(returned);
      result["nextCursor"] = next_cursor.clone();
      let Some(cursor) = next_cursor.as_str() else {
        break;
      };
      if returned >= limit || limit == 0 {
        break;
      }
      dsl
        .as_object_mut()
        .expect("compiled search DSL is an object")
        .remove("from");
      dsl["cursor"] = serde_json::json!(cursor);
      dsl["size"] = serde_json::json!(limit - returned);
    }
    Ok(result)
  }

  pub(super) async fn retain_canonically_visible(
    &self,
    generation: &ActiveGeneration,
    workspace_id: &str,
    actor_user_id: &str,
    scope: &DocReadScope,
    result: &mut serde_json::Value,
  ) -> RuntimeResult<()> {
    let candidate_tuples = candidates(result)?;
    let doc_ids = candidate_tuples
      .iter()
      .map(|candidate| candidate.doc_id.clone())
      .collect::<BTreeSet<_>>()
      .into_iter()
      .collect::<Vec<_>>();
    if doc_ids.is_empty() {
      return retain_visible_nodes(result, &BTreeSet::new());
    }
    let rows = sqlx::query(
      r#"SELECT state.doc_id,state.published_source_version,state.published_permission_version
         FROM search_projection.document_states state
         JOIN snapshots source
           ON source.workspace_id=state.workspace_id AND source.guid=state.doc_id
         WHERE state.generation_id=$1 AND state.workspace_id=$2
           AND state.doc_id=ANY($3) AND state.published_source_exists"#,
    )
    .bind(generation.id)
    .bind(workspace_id)
    .bind(&doc_ids)
    .fetch_all(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("load published search document states", error))?;
    let published = rows
      .into_iter()
      .map(|row| {
        let doc_id: String = row
          .try_get("doc_id")
          .map_err(|error| RuntimeError::database("decode published search document", error))?;
        let source_version: i64 = row
          .try_get("published_source_version")
          .map_err(|error| RuntimeError::database("decode published search source version", error))?;
        let permission_version: i64 = row
          .try_get("published_permission_version")
          .map_err(|error| RuntimeError::database("decode published search permission version", error))?;
        Ok((doc_id, (source_version, permission_version)))
      })
      .collect::<RuntimeResult<BTreeMap<_, _>>>()?;
    let current_doc_ids = candidate_tuples
      .iter()
      .filter(|candidate| {
        published.get(&candidate.doc_id) == Some(&(candidate.source_version, candidate.permission_version))
      })
      .map(|candidate| candidate.doc_id.clone())
      .collect::<BTreeSet<_>>();
    let missing_published = candidate_tuples
      .iter()
      .filter(|candidate| !published.contains_key(&candidate.doc_id))
      .count() as u64;
    let projection_mismatch = candidate_tuples
      .iter()
      .filter(|candidate| {
        published
          .get(&candidate.doc_id)
          .is_some_and(|tuple| *tuple != (candidate.source_version, candidate.permission_version))
      })
      .count() as u64;
    let readable = if matches!(scope, DocReadScope::ProjectedAcl(_)) {
      self
        .authorizer
        .filter_readable_docs(workspace_id, actor_user_id, current_doc_ids.iter().cloned().collect())
        .await?
    } else {
      current_doc_ids.clone()
    };
    self
      .observability
      .missing_published
      .fetch_add(missing_published, Ordering::Relaxed);
    self
      .observability
      .projection_mismatch
      .fetch_add(projection_mismatch, Ordering::Relaxed);
    self.observability.canonical_permission.fetch_add(
      current_doc_ids.len().saturating_sub(readable.len()) as u64,
      Ordering::Relaxed,
    );
    let visible = candidate_tuples
      .into_iter()
      .filter(|candidate| {
        readable.contains(&candidate.doc_id)
          && published.get(&candidate.doc_id) == Some(&(candidate.source_version, candidate.permission_version))
      })
      .collect::<BTreeSet<_>>();
    retain_visible_nodes(result, &visible)
  }

  pub(in crate::runtime::backend_runtime) async fn aggregate_authorized(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    request: RuntimeAggregateRequest,
  ) -> RuntimeResult<serde_json::Value> {
    let request = request.into_aggregate_request()?;
    for attempt in 0..=1 {
      let scope = self
        .authorizer
        .authorize_search(
          &SearchActor::User {
            user_id: actor_user_id.to_string(),
          },
          workspace_id,
        )
        .await?;
      let (generation, required_permission_version) = self.query_gate(workspace_id).await?;
      let dsl = compile_aggregate(&request, &scope)?;
      let mut result = self.execute_aggregate(&generation, request.table, dsl).await?;
      self
        .retain_canonically_visible(&generation, workspace_id, actor_user_id, &scope.docs, &mut result)
        .await?;
      if self
        .query_snapshot_is_current(workspace_id, generation.id, required_permission_version)
        .await?
      {
        return Ok(result);
      }
      if attempt == 1 {
        return Err(RuntimeError::SearchPermissionSyncing);
      }
    }
    unreachable!()
  }

  async fn execute_search(
    &self,
    generation: &ActiveGeneration,
    table: SearchTable,
    dsl: serde_json::Value,
  ) -> RuntimeResult<serde_json::Value> {
    let started = Instant::now();
    let result = if let Some(remote) = &self.remote {
      remote.search(generation.physical_table(table)?, dsl).await
    } else if !self.embedded.has_generation(generation.id).await {
      Err(RuntimeError::SearchIndexNotReady)
    } else {
      match serde_json::to_string(&dsl).map_err(|error| RuntimeError::json("encode embedded search", error)) {
        Ok(dsl) => match self
          .embedded
          .search_for_generation(generation.id, table.as_str().to_string(), dsl)
          .await
        {
          Ok(result) => {
            serde_json::from_str(&result).map_err(|error| RuntimeError::json("decode embedded search", error))
          }
          Err(error) => Err(error.into()),
        },
        Err(error) => Err(error),
      }
    };
    self.observe_provider_request(started);
    result
  }

  async fn execute_aggregate(
    &self,
    generation: &ActiveGeneration,
    table: SearchTable,
    dsl: serde_json::Value,
  ) -> RuntimeResult<serde_json::Value> {
    let started = Instant::now();
    let result = if let Some(remote) = &self.remote {
      remote.aggregate(generation.physical_table(table)?, dsl).await
    } else if !self.embedded.has_generation(generation.id).await {
      Err(RuntimeError::SearchIndexNotReady)
    } else {
      match serde_json::to_string(&dsl).map_err(|error| RuntimeError::json("encode embedded aggregate", error)) {
        Ok(dsl) => match self
          .embedded
          .aggregate_for_generation(generation.id, table.as_str().to_string(), dsl)
          .await
        {
          Ok(result) => {
            serde_json::from_str(&result).map_err(|error| RuntimeError::json("decode embedded aggregate", error))
          }
          Err(error) => Err(error.into()),
        },
        Err(error) => Err(error),
      }
    };
    self.observe_provider_request(started);
    let mut value: serde_json::Value = result?;
    if let Some(buckets) = value.get_mut("buckets").and_then(serde_json::Value::as_array_mut) {
      for bucket in buckets {
        let hits = bucket
          .as_object_mut()
          .and_then(|bucket| bucket.remove("hits"))
          .unwrap_or_else(|| serde_json::json!([]));
        bucket["hits"] = serde_json::json!({"nodes":hits});
      }
    }
    Ok(value)
  }

  fn observe_provider_request(&self, started: Instant) {
    self.observability.provider_requests.fetch_add(1, Ordering::Relaxed);
    self.observability.provider_latency_micros.fetch_add(
      started.elapsed().as_micros().min(u64::MAX as u128) as u64,
      Ordering::Relaxed,
    );
  }

  async fn query_gate(&self, workspace_id: &str) -> RuntimeResult<(ActiveGeneration, i64)> {
    let generation = self.active_generation().await?;
    let row = sqlx::query(
      r#"SELECT covered,required_permission_version,applied_permission_version,last_error
         FROM search_projection.workspace_states WHERE generation_id=$1 AND workspace_id=$2"#,
    )
    .bind(generation.id)
    .bind(workspace_id)
    .fetch_optional(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("load search workspace gate", error))?
    .ok_or(RuntimeError::SearchIndexNotReady)?;
    let covered: bool = row
      .try_get("covered")
      .map_err(|error| RuntimeError::database("decode search coverage", error))?;
    let required: i64 = row
      .try_get("required_permission_version")
      .map_err(|error| RuntimeError::database("decode search required permission", error))?;
    let applied: i64 = row
      .try_get("applied_permission_version")
      .map_err(|error| RuntimeError::database("decode search applied permission", error))?;
    let last_error: Option<String> = row
      .try_get("last_error")
      .map_err(|error| RuntimeError::database("decode search workspace error", error))?;
    if last_error.is_some() {
      return Err(RuntimeError::SearchIndexFailed(
        "search_workspace_reconcile_failed".to_string(),
      ));
    }
    if !covered {
      return Err(RuntimeError::SearchIndexNotReady);
    }
    if required > applied {
      return Err(RuntimeError::SearchPermissionSyncing);
    }
    Ok((generation, required))
  }

  pub(super) async fn query_snapshot_is_current(
    &self,
    workspace_id: &str,
    generation_id: uuid::Uuid,
    permission_version: i64,
  ) -> RuntimeResult<bool> {
    sqlx::query_scalar(
      r#"SELECT EXISTS(
           SELECT 1 FROM search_projection.generations generation
           JOIN search_projection.workspace_states state ON state.generation_id=generation.id
           WHERE generation.id=$1 AND state.workspace_id=$2 AND generation.state='active'
             AND state.required_permission_version=$3
         )"#,
    )
    .bind(generation_id)
    .bind(workspace_id)
    .bind(permission_version)
    .fetch_one(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("recheck search query snapshot", error))
  }
}
