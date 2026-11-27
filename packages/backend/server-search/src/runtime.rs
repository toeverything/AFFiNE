use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::{Value, json};
use server_spi::QuotaGate;
use server_worker::WorkerSupervisor;
use sqlx::{PgPool, Row};
use tokio::sync::{Mutex, RwLock};
use tokio::time::{Duration, Instant};
use uuid::Uuid;

use crate::acl::{AuthorizedSearchScope, DocReadScope, SearchAuthorizer};
use crate::config::SearchConfig;
use crate::doc_extract::LegacyWorkspace;
use crate::embedded::EmbeddedSearchIndex;
use crate::error::{SearchError, SearchResult};
use crate::generation::{
  ActiveGeneration, activate, cleanup_retired_generation, config_hash, ensure, fail, load_active_in,
};
use crate::lease::{LOCKLESS_V2_RENEW_INTERVAL, renew_lockless_v2_lease};
use crate::projection::load_legacy_workspace_in;
use crate::provider::SearchProvider;
use crate::query::{compile, compile_aggregate};
use crate::result_filter::{candidates, retain_visible_nodes};
use crate::types::{AggregateRequest, SearchQuery, SearchRequest, SearchTable};
use crate::worker::{reconcile_workspace, sweep_generation_orphans};
use crate::{
  DOCUMENT_PROJECTION_FAILED, EMBEDDED_GENERATION_LOST, SCHEMA_FINGERPRINT, WORKSPACE_RECONCILE_FAILED,
  is_ordinary_workspace_doc, workspace_lifecycle_active_in, workspace_lifecycle_completed,
};

const SEARCH_CANDIDATE_PAGE_BUDGET: usize = 3;

#[derive(Default)]
struct SearchObservability {
  provider_requests: AtomicU64,
  provider_latency_micros: AtomicU64,
  missing_published: AtomicU64,
  projection_mismatch: AtomicU64,
  canonical_permission: AtomicU64,
  generation_gc_failures: AtomicU64,
}

pub struct SearchRuntime {
  pool: PgPool,
  authorizer: SearchAuthorizer,
  embedded: EmbeddedSearchIndex,
  remote: Option<SearchProvider>,
  config: SearchConfig,
  generation: RwLock<Option<ActiveGeneration>>,
  lifecycle_lock: Mutex<()>,
  observability: SearchObservability,
}

impl SearchRuntime {
  pub fn new(pool: PgPool, quota_gate: Arc<dyn QuotaGate>, config: SearchConfig) -> SearchResult<Self> {
    if !matches!(
      config.provider.as_str(),
      "embedded" | "elasticsearch" | "manticoresearch"
    ) {
      return Err(SearchError::config("unsupported search provider"));
    }
    let remote = (config.provider != "embedded")
      .then(|| SearchProvider::new(&config))
      .transpose()?;
    Ok(Self {
      authorizer: SearchAuthorizer::new(pool.clone(), quota_gate),
      embedded: EmbeddedSearchIndex::new(),
      remote,
      config,
      generation: RwLock::new(None),
      lifecycle_lock: Mutex::new(()),
      observability: SearchObservability::default(),
      pool,
    })
  }

  pub fn enabled(&self) -> bool {
    self.config.enabled
  }

  pub fn embedded(&self) -> &EmbeddedSearchIndex {
    &self.embedded
  }

  pub fn pool(&self) -> &PgPool {
    &self.pool
  }

  pub async fn initialize(&self) -> SearchResult<()> {
    if !self.config.enabled {
      return Ok(());
    }
    let _lock = self.lifecycle_lock.lock().await;
    let schema_ready: bool = sqlx::query_scalar("SELECT to_regclass('search_projection.generations') IS NOT NULL")
      .fetch_one(&self.pool)
      .await
      .map_err(|error| SearchError::database("check search projection schema", error))?;
    if !schema_ready {
      return Ok(());
    }
    if let Err(err) = renew_lockless_v2_lease(&self.pool).await {
      tracing::warn!(error = %err, "search lockless_v2 lease renewal failed");
    }
    let rebuild_embedded = if self.config.provider == "embedded" {
      let current = self.generation.read().await.clone();
      match current {
        Some(generation) => !self.embedded.has_generation(generation.id).await,
        None => true,
      }
    } else {
      false
    };
    let generation = ensure(&self.pool, &self.config, None, rebuild_embedded).await?;
    if self.config.provider == "embedded" {
      self.embedded.prepare_generation(generation.id).await;
    }
    *self.generation.write().await = Some(generation);
    Ok(())
  }

  pub async fn spawn_worker_loop(self: &Arc<Self>, supervisor: &WorkerSupervisor) {
    if !self.config.enabled {
      return;
    }
    let lease_pool = self.pool.clone();
    supervisor
      .spawn(move |shutdown| async move {
        let _ = renew_lockless_v2_lease(&lease_pool).await;
        loop {
          tokio::select! {
            () = shutdown.cancelled() => break,
            () = tokio::time::sleep(LOCKLESS_V2_RENEW_INTERVAL) => {
              if let Err(err) = renew_lockless_v2_lease(&lease_pool).await {
                tracing::warn!(error = %err, "search lockless_v2 lease renewal failed");
              }
            }
          }
        }
      })
      .await;

    let runtime = Arc::clone(self);
    let poll_interval = self.config.worker_poll_interval;
    let batch_limit = self.config.worker_batch_limit;
    supervisor
      .spawn(move |shutdown| async move {
        loop {
          if shutdown.is_cancelled() {
            break;
          }
          if let Err(err) = runtime.reconcile_pending(batch_limit).await {
            tracing::warn!(error = %err, "search reconcile tick failed");
          }
          tokio::select! {
            () = shutdown.cancelled() => break,
            () = tokio::time::sleep(poll_interval) => {}
          }
        }
      })
      .await;
  }

  async fn candidate_or_active(&self) -> SearchResult<ActiveGeneration> {
    let mut generation = ensure(&self.pool, &self.config, self.remote.as_ref(), false).await?;
    if self.config.provider == "embedded" && !self.embedded.has_generation(generation.id).await {
      generation = ensure(&self.pool, &self.config, self.remote.as_ref(), true).await?;
    }
    if self.config.provider == "embedded" {
      self.embedded.prepare_generation(generation.id).await;
    }
    *self.generation.write().await = Some(generation.clone());
    Ok(generation)
  }

  pub async fn active_generation(&self) -> SearchResult<ActiveGeneration> {
    let mut connection = self
      .pool
      .acquire()
      .await
      .map_err(|error| SearchError::database("acquire connection for active search generation", error))?;
    let generation = self.active_generation_in(&mut connection).await?;
    *self.generation.write().await = Some(generation.clone());
    Ok(generation)
  }

  pub async fn reconcile_pending(&self, limit: i32) -> SearchResult<usize> {
    const TIME_BUDGET: Duration = Duration::from_secs(20);

    let _lock = self.lifecycle_lock.lock().await;
    let started_at = Instant::now();
    if let Err(err) = renew_lockless_v2_lease(&self.pool).await {
      tracing::warn!(error = %err, "search lockless_v2 lease renewal failed");
    }

    if cleanup_retired_generation(&self.pool, &self.embedded, self.remote.as_ref(), &self.config)
      .await
      .is_err()
    {
      self
        .observability
        .generation_gc_failures
        .fetch_add(1, Ordering::Relaxed);
    }
    let generation = self.candidate_or_active().await?;
    if self.config.provider == "embedded" {
      self.embedded.prepare_generation(generation.id).await;
    }
    let limit = i64::from(limit.clamp(1, 1000));
    let (high_water, scan_complete) = self.seed_generation(generation.id, limit).await?;
    if high_water.is_none() {
      return Ok(0);
    }

    let workspaces = sqlx::query(
      r#"SELECT workspace_id FROM search_projection.workspace_states
         WHERE generation_id = $1
           AND last_error IS DISTINCT FROM 'search_workspace_reconcile_failed'
           AND (NOT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints activation
                  WHERE activation.kind = 'workspace_doc_lifecycle_activation'
                    AND activation.scope = 'global' AND activation.status = 'active')
             OR NOT EXISTS(SELECT 1 FROM workspaces workspace WHERE workspace.id = workspace_states.workspace_id)
             OR EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints checkpoint
               WHERE checkpoint.kind = 'workspace_doc_lifecycle' AND checkpoint.scope = workspace_states.workspace_id
                 AND checkpoint.status = 'completed'))
           AND (
             available_at <= now()
             OR EXISTS (SELECT 1 FROM search_projection.document_states document
                        WHERE document.generation_id = workspace_states.generation_id
                          AND document.workspace_id = workspace_states.workspace_id
                          AND document.last_error IS NULL
                          AND document.available_at <= now()
                          AND (document.target_source_version <> document.published_source_version
                            OR document.target_source_exists <> document.published_source_exists
                            OR document.target_permission_version <> document.published_permission_version))
           )
         ORDER BY workspace_id LIMIT $2"#,
    )
    .bind(generation.id)
    .bind(limit)
    .fetch_all(&self.pool)
    .await
    .map_err(|error| SearchError::database("load pending search workspaces", error))?;

    let mut reconciled = 0;
    let mut processed = false;
    for row in workspaces {
      if processed && started_at.elapsed() >= TIME_BUDGET {
        break;
      }
      processed = true;
      let workspace_id: String = row
        .try_get("workspace_id")
        .map_err(|error| SearchError::database("decode pending search workspace", error))?;
      match reconcile_workspace(
        &self.pool,
        &self.embedded,
        self.remote.as_ref(),
        &generation,
        &workspace_id,
      )
      .await
      {
        Ok(true) => reconciled += 1,
        Ok(false) => {}
        Err(error) if error.is_permanent_search_generation() => {
          fail(&self.pool, &generation, &error.to_string()).await?;
          return Err(error);
        }
        Err(error) => return Err(error),
      }
    }

    if let Err(error) = sweep_generation_orphans(&self.pool, &self.embedded, self.remote.as_ref(), &generation).await {
      if error.is_permanent_search_generation() {
        fail(&self.pool, &generation, &error.to_string()).await?;
        return Err(error);
      }
      self
        .observability
        .generation_gc_failures
        .fetch_add(1, Ordering::Relaxed);
    }

    if scan_complete && let Some(high_water_sid) = high_water {
      let seeded: i64 =
        sqlx::query_scalar("SELECT count(*) FROM search_projection.workspace_states WHERE generation_id = $1")
          .bind(generation.id)
          .fetch_one(&self.pool)
          .await
          .map_err(|error| SearchError::database("count seeded search workspaces", error))?;
      let total: i64 = sqlx::query_scalar("SELECT count(*) FROM workspaces WHERE sid <= $1")
        .bind(high_water_sid)
        .fetch_one(&self.pool)
        .await
        .map_err(|error| SearchError::database("count search workspaces", error))?;
      let pending: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM search_projection.workspace_states WHERE generation_id = $1 AND last_error IS DISTINCT FROM $2 AND (NOT covered OR pending_scope <> 'none'))
         OR EXISTS (SELECT 1 FROM search_projection.document_states document WHERE generation_id = $1 AND last_error IS DISTINCT FROM $3 AND NOT EXISTS (SELECT 1 FROM search_projection.workspace_states workspace WHERE workspace.generation_id = document.generation_id AND workspace.workspace_id = document.workspace_id AND workspace.last_error = $2) AND (target_source_version <> published_source_version OR target_source_exists <> published_source_exists OR target_permission_version <> published_permission_version))",
      )
      .bind(generation.id)
      .bind(WORKSPACE_RECONCILE_FAILED)
      .bind(DOCUMENT_PROJECTION_FAILED)
      .fetch_one(&self.pool)
      .await
      .map_err(|error| SearchError::database("check pending search projection", error))?;
      if seeded >= total && !pending {
        let state: String = sqlx::query_scalar("SELECT state FROM search_projection.generations WHERE id = $1")
          .bind(generation.id)
          .fetch_one(&self.pool)
          .await
          .map_err(|error| SearchError::database("load search generation state", error))?;
        if state != "active" {
          activate(&self.pool, &generation, &self.config).await?;
          if self.config.provider == "embedded" {
            self.embedded.retain_generation(generation.id).await;
          }
          *self.generation.write().await = Some(generation);
        }
      }
    }
    Ok(reconciled)
  }

  /// Advances generation seeding using a two-beat post-commit `xid8` discovery fence:
  ///
  /// - Beat 1 (`!(manifest ? 'fenceXid')`): once the `building` generation is committed
  ///   and visible to all subsequent `READ COMMITTED` triggers, allocate and commit
  ///   `fenceXid = pg_current_xact_id()` and return `(None, false)`.
  /// - Beat 2 (`manifest ? 'fenceXid'`): wait until
  ///   `pg_snapshot_xmin(pg_current_snapshot()) > fenceXid` before latching
  ///   `scan_high_water_sid = COALESCE(MAX(sid), 0)` so no late-committing writer whose
  ///   snapshot predated generation commit can be missed.
  async fn seed_generation(&self, generation_id: Uuid, limit: i64) -> SearchResult<(Option<i32>, bool)> {
    let mut transaction = self
      .pool
      .begin()
      .await
      .map_err(|error| SearchError::database("begin search generation scan", error))?;
    let row = sqlx::query(
      r#"SELECT scan_high_water_sid,
                COALESCE(scan_cursor_sid, 0) AS cursor,
                manifest ? 'fenceXid' AS has_fence_xid,
                CASE
                  WHEN manifest ? 'fenceXid'
                  THEN pg_snapshot_xmin(pg_current_snapshot()) > (manifest->>'fenceXid')::xid8
                  ELSE false
                END AS xid_fence_passed,
                (SELECT COALESCE(MAX(sid), 0) FROM workspaces) AS current_max_sid
         FROM search_projection.generations
         WHERE id = $1
         FOR NO KEY UPDATE"#,
    )
    .bind(generation_id)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|error| SearchError::database("load search generation scan", error))?;

    let existing_high_water: Option<i32> = row
      .try_get("scan_high_water_sid")
      .map_err(|error| SearchError::database("decode search generation high water", error))?;
    let cursor: i32 = row
      .try_get("cursor")
      .map_err(|error| SearchError::database("decode search generation cursor", error))?;
    let has_fence_xid: bool = row
      .try_get("has_fence_xid")
      .map_err(|error| SearchError::database("decode search generation fence presence", error))?;
    let xid_fence_passed: bool = row
      .try_get("xid_fence_passed")
      .map_err(|error| SearchError::database("decode search generation xid fence", error))?;
    let current_max_sid: i32 = row
      .try_get("current_max_sid")
      .map_err(|error| SearchError::database("decode current max workspace sid", error))?;

    let high_water = match existing_high_water {
      Some(hw) => hw,
      None if !has_fence_xid => {
        sqlx::query(
          r#"UPDATE search_projection.generations
             SET manifest = jsonb_set(manifest, '{fenceXid}', to_jsonb(pg_current_xact_id()::text), true)
             WHERE id = $1"#,
        )
        .bind(generation_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| SearchError::database("persist search generation fenceXid", error))?;
        transaction
          .commit()
          .await
          .map_err(|error| SearchError::database("commit search generation fenceXid", error))?;
        return Ok((None, false));
      }
      None if !xid_fence_passed => {
        transaction
          .commit()
          .await
          .map_err(|error| SearchError::database("commit deferred search generation scan", error))?;
        return Ok((None, false));
      }
      None => current_max_sid,
    };

    let seeds = sqlx::query("SELECT id, sid FROM workspaces WHERE sid > $1 AND sid <= $2 ORDER BY sid LIMIT $3")
      .bind(cursor)
      .bind(high_water)
      .bind(limit)
      .fetch_all(&mut *transaction)
      .await
      .map_err(|error| SearchError::database("load search workspace scan batch", error))?;
    let exhausted = seeds.len() < limit as usize;
    let mut next_cursor = cursor;
    for row in seeds {
      let workspace_id: String = row
        .try_get("id")
        .map_err(|error| SearchError::database("decode search workspace id", error))?;
      next_cursor = row
        .try_get("sid")
        .map_err(|error| SearchError::database("decode search workspace sid", error))?;
      sqlx::query(
        "INSERT INTO search_projection.workspace_states(generation_id, workspace_id, target_root_revision)
         VALUES ($1, $2, nextval('search_projection.source_mutation_version')) ON CONFLICT DO NOTHING",
      )
      .bind(generation_id)
      .bind(workspace_id)
      .execute(&mut *transaction)
      .await
      .map_err(|error| SearchError::database("seed search workspace state", error))?;
    }
    if exhausted {
      next_cursor = high_water;
    }
    sqlx::query(
      "UPDATE search_projection.generations SET scan_high_water_sid = $2, scan_cursor_sid = $3 WHERE id = $1",
    )
    .bind(generation_id)
    .bind(high_water)
    .bind(next_cursor)
    .execute(&mut *transaction)
    .await
    .map_err(|error| SearchError::database("persist search generation scan progress", error))?;
    transaction
      .commit()
      .await
      .map_err(|error| SearchError::database("commit search generation scan", error))?;
    Ok((Some(high_water), next_cursor >= high_water))
  }

  pub async fn search_authorized(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    request: SearchRequest,
  ) -> SearchResult<Value> {
    if !self.config.enabled {
      return Err(SearchError::ProviderUnavailable);
    }
    for attempt in 0..=1 {
      let (scope, legacy, generation, required_permission_version) = self
        .prepare_authorized_query_snapshot(actor_user_id, workspace_id)
        .await?;
      let mut request = request.clone();
      if let Some(legacy) = &legacy {
        translate_legacy_query_ids(legacy, &mut request.query);
      }
      let dsl = compile(&request, &scope)?;
      let result = self
        .execute_visible_search(&generation, actor_user_id, &scope, legacy.as_ref(), request.table, dsl)
        .await?;
      if self
        .query_snapshot_is_current(workspace_id, generation.id, required_permission_version)
        .await?
      {
        return Ok(result);
      }
      if attempt == 1 {
        return Err(SearchError::PermissionSyncing);
      }
    }
    unreachable!()
  }

  pub async fn aggregate_authorized(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    request: AggregateRequest,
  ) -> SearchResult<Value> {
    if !self.config.enabled {
      return Err(SearchError::ProviderUnavailable);
    }
    for attempt in 0..=1 {
      let (scope, legacy, generation, required_permission_version) = self
        .prepare_authorized_query_snapshot(actor_user_id, workspace_id)
        .await?;
      let mut request = request.clone();
      if let Some(legacy) = &legacy {
        translate_legacy_query_ids(legacy, &mut request.query);
      }
      let dsl = compile_aggregate(&request, &scope)?;
      let mut result = self.execute_aggregate(&generation, request.table, dsl).await?;
      self
        .retain_canonically_visible(&generation, actor_user_id, &scope, legacy.as_ref(), &mut result)
        .await?;
      if self
        .query_snapshot_is_current(workspace_id, generation.id, required_permission_version)
        .await?
      {
        return Ok(result);
      }
      if attempt == 1 {
        return Err(SearchError::PermissionSyncing);
      }
    }
    unreachable!()
  }

  async fn execute_visible_search(
    &self,
    generation: &ActiveGeneration,
    actor_user_id: &str,
    scope: &AuthorizedSearchScope,
    legacy: Option<&LegacyWorkspace>,
    table: SearchTable,
    mut dsl: Value,
  ) -> SearchResult<Value> {
    let limit = dsl.get("size").and_then(Value::as_u64).unwrap_or(10) as usize;
    let mut result = json!({"total": 0, "nodes": [], "nextCursor": null});
    for _ in 0..SEARCH_CANDIDATE_PAGE_BUDGET {
      let mut page = self.execute_search(generation, table, dsl.clone()).await?;
      self
        .retain_canonically_visible(generation, actor_user_id, scope, legacy, &mut page)
        .await?;
      let next_cursor = page.get("nextCursor").cloned().unwrap_or(Value::Null);
      let nodes = page
        .get_mut("nodes")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| SearchError::invalid_state("invalid provider response"))?;
      result["nodes"]
        .as_array_mut()
        .expect("search result nodes are initialized")
        .append(nodes);
      let returned = result["nodes"]
        .as_array()
        .expect("search result nodes are initialized")
        .len();
      result["total"] = json!(returned);
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
      dsl["cursor"] = json!(cursor);
      dsl["size"] = json!(limit - returned);
    }
    Ok(result)
  }

  async fn retain_canonically_visible(
    &self,
    generation: &ActiveGeneration,
    actor_user_id: &str,
    scope: &AuthorizedSearchScope,
    legacy: Option<&LegacyWorkspace>,
    result: &mut Value,
  ) -> SearchResult<()> {
    let workspace_id = &scope.workspace_id;
    let candidate_tuples = candidates(result)?;
    let doc_ids = candidate_tuples
      .iter()
      .filter(|candidate| is_ordinary_workspace_doc(workspace_id, &candidate.doc_id))
      .map(|candidate| candidate.doc_id.clone())
      .collect::<BTreeSet<_>>()
      .into_iter()
      .collect::<Vec<_>>();
    if doc_ids.is_empty() {
      return retain_visible_nodes(result, &BTreeSet::new());
    }
    let legacy_visible = legacy.map(LegacyWorkspace::active_doc_ids);
    let rows = sqlx::query(
      r#"SELECT state.doc_id, state.published_source_version, state.published_permission_version
         FROM search_projection.document_states state
         LEFT JOIN workspace_pages page
           ON page.workspace_id = state.workspace_id AND page.page_id = state.doc_id
         WHERE state.generation_id = $1 AND state.workspace_id = $2
           AND state.doc_id = ANY($3) AND state.published_source_exists
           AND ($4 OR page.lifecycle_state IS NULL)
           AND (EXISTS(SELECT 1 FROM snapshots source WHERE source.workspace_id = state.workspace_id AND source.guid = state.doc_id)
             OR EXISTS(SELECT 1 FROM updates source WHERE source.workspace_id = state.workspace_id AND source.guid = state.doc_id))
           AND state.last_error IS NULL"#,
    )
    .bind(generation.id)
    .bind(workspace_id)
    .bind(&doc_ids)
    .bind(legacy.is_some())
    .fetch_all(&self.pool)
    .await
    .map_err(|error| SearchError::database("load published search document states", error))?;

    let mut published = rows
      .into_iter()
      .map(|row| {
        let doc_id: String = row
          .try_get("doc_id")
          .map_err(|error| SearchError::database("decode published search document", error))?;
        let source_version: i64 = row
          .try_get("published_source_version")
          .map_err(|error| SearchError::database("decode published search source version", error))?;
        let permission_version: i64 = row
          .try_get("published_permission_version")
          .map_err(|error| SearchError::database("decode published search permission version", error))?;
        Ok((doc_id, (source_version, permission_version)))
      })
      .collect::<SearchResult<BTreeMap<_, _>>>()?;
    if let Some(ids) = &legacy_visible {
      published.retain(|id, _| ids.contains(id));
    }

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
    let readable = if matches!(scope.docs, DocReadScope::ProjectedAcl(_)) {
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
    retain_visible_nodes(result, &visible)?;
    Ok(())
  }

  /// Reads actor authorization, legacy workspace view, active generation, and
  /// `required_permission_version` inside one `REPEATABLE READ READ ONLY`
  /// snapshot so authorization scope and permission version cannot skew across
  /// concurrent role demotions.
  async fn prepare_authorized_query_snapshot(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
  ) -> SearchResult<(AuthorizedSearchScope, Option<LegacyWorkspace>, ActiveGeneration, i64)> {
    let mut tx = self
      .pool
      .begin()
      .await
      .map_err(|error| SearchError::database("begin search query snapshot", error))?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
      .execute(&mut *tx)
      .await
      .map_err(|error| SearchError::database("set repeatable read search query snapshot", error))?;

    let scope = self
      .authorizer
      .authorize_search_in(&mut tx, actor_user_id, workspace_id)
      .await?;

    let legacy = if workspace_lifecycle_active_in(&mut tx).await? {
      if !workspace_lifecycle_completed(&mut tx, workspace_id).await? {
        return Err(SearchError::IndexNotReady);
      }
      None
    } else {
      Some(load_legacy_workspace_in(&mut tx, workspace_id).await?)
    };

    let generation = self.active_generation_in(&mut tx).await?;
    let row = sqlx::query(
      r#"SELECT covered, required_permission_version, applied_permission_version, last_error
         FROM search_projection.workspace_states WHERE generation_id = $1 AND workspace_id = $2"#,
    )
    .bind(generation.id)
    .bind(workspace_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| SearchError::database("load search workspace gate", error))?
    .ok_or(SearchError::IndexNotReady)?;

    let covered: bool = row
      .try_get("covered")
      .map_err(|error| SearchError::database("decode search coverage", error))?;
    let required: i64 = row
      .try_get("required_permission_version")
      .map_err(|error| SearchError::database("decode search required permission", error))?;
    let applied: i64 = row
      .try_get("applied_permission_version")
      .map_err(|error| SearchError::database("decode search applied permission", error))?;
    let last_error: Option<String> = row
      .try_get("last_error")
      .map_err(|error| SearchError::database("decode search workspace error", error))?;
    let _ = tx.rollback().await;

    if last_error.is_some() {
      return Err(SearchError::IndexFailed(WORKSPACE_RECONCILE_FAILED.to_owned()));
    }
    if !covered {
      return Err(SearchError::IndexNotReady);
    }
    if required > applied {
      return Err(SearchError::PermissionSyncing);
    }
    *self.generation.write().await = Some(generation.clone());
    Ok((scope, legacy, generation, required))
  }

  async fn active_generation_in(&self, connection: &mut sqlx::PgConnection) -> SearchResult<ActiveGeneration> {
    let generation = load_active_in(connection, &self.config).await?;
    let Some(generation) = generation else {
      let building: bool = sqlx::query_scalar(
        r#"SELECT EXISTS(
             SELECT 1 FROM search_projection.generations
             WHERE state = 'building' AND provider = $1 AND config_hash = $2 AND schema_version = $3
           )"#,
      )
      .bind(&self.config.provider)
      .bind(config_hash(&self.config))
      .bind(SCHEMA_FINGERPRINT)
      .fetch_one(&mut *connection)
      .await
      .map_err(|error| SearchError::database("load building search generation", error))?;
      if building {
        return Err(SearchError::IndexNotReady);
      }
      if let Some(error) = sqlx::query_scalar::<_, Option<String>>(
        r#"SELECT last_error FROM search_projection.generations
           WHERE state = 'failed' AND provider = $1 AND config_hash = $2 AND schema_version = $3
             AND last_error IS DISTINCT FROM $4
           ORDER BY created_at DESC LIMIT 1"#,
      )
      .bind(&self.config.provider)
      .bind(config_hash(&self.config))
      .bind(SCHEMA_FINGERPRINT)
      .bind(EMBEDDED_GENERATION_LOST)
      .fetch_optional(&mut *connection)
      .await
      .map_err(|error| SearchError::database("load failed search generation", error))?
      .flatten()
      {
        return Err(SearchError::IndexFailed(error));
      }
      return Err(SearchError::IndexNotReady);
    };
    if self.config.provider == "embedded" && !self.embedded.has_generation(generation.id).await {
      return Err(SearchError::IndexNotReady);
    }
    Ok(generation)
  }

  async fn execute_search(&self, generation: &ActiveGeneration, table: SearchTable, dsl: Value) -> SearchResult<Value> {
    let started = Instant::now();
    let result = if let Some(remote) = &self.remote {
      remote.search(generation.physical_table(table)?, dsl).await
    } else if !self.embedded.has_generation(generation.id).await {
      Err(SearchError::IndexNotReady)
    } else {
      self
        .embedded
        .search_for_generation(generation.id, table.as_str(), dsl)
        .await
    };
    self.observe_provider_request(started);
    result
  }

  async fn execute_aggregate(
    &self,
    generation: &ActiveGeneration,
    table: SearchTable,
    dsl: Value,
  ) -> SearchResult<Value> {
    let started = Instant::now();
    let result = if let Some(remote) = &self.remote {
      remote.aggregate(generation.physical_table(table)?, dsl).await
    } else if !self.embedded.has_generation(generation.id).await {
      Err(SearchError::IndexNotReady)
    } else {
      self
        .embedded
        .aggregate_for_generation(generation.id, table.as_str(), dsl)
        .await
    };
    self.observe_provider_request(started);
    let mut value = result?;
    if let Some(buckets) = value.get_mut("buckets").and_then(Value::as_array_mut) {
      for bucket in buckets {
        let hits = bucket
          .as_object_mut()
          .and_then(|bucket| bucket.remove("hits"))
          .unwrap_or_else(|| json!([]));
        bucket["hits"] = json!({"nodes": hits});
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

  async fn query_snapshot_is_current(
    &self,
    workspace_id: &str,
    generation_id: Uuid,
    permission_version: i64,
  ) -> SearchResult<bool> {
    sqlx::query_scalar(
      r#"SELECT EXISTS(
           SELECT 1 FROM search_projection.generations generation
           JOIN search_projection.workspace_states state ON state.generation_id = generation.id
           WHERE generation.id = $1 AND state.workspace_id = $2 AND generation.state = 'active'
             AND state.required_permission_version = $3
         )"#,
    )
    .bind(generation_id)
    .bind(workspace_id)
    .bind(permission_version)
    .fetch_one(&self.pool)
    .await
    .map_err(|error| SearchError::database("recheck search query snapshot", error))
  }
}

fn translate_legacy_query_ids(legacy: &LegacyWorkspace, query: &mut SearchQuery) {
  if matches!(query.field.as_deref(), Some("doc_id" | "docId"))
    && let Some(id) = query.match_value.as_mut()
    && let Some(physical) = legacy.aliases.get(id)
  {
    *id = physical.clone();
  }
  if let Some(nested) = query.query.as_deref_mut() {
    translate_legacy_query_ids(legacy, nested);
  }
  if let Some(queries) = query.queries.as_deref_mut() {
    for q in queries {
      translate_legacy_query_ids(legacy, q);
    }
  }
}
