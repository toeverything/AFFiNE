use sqlx::PgPool;
use tokio::sync::{Mutex, RwLock};

use super::{
  super::permission::{PermissionAuthorizer, SearchActor, SystemSearchCapability},
  generation::{self, ActiveGeneration},
  projection::project_document,
  provider::RemoteProvider,
  query,
  store::{SearchStore, SearchTable},
  types::{RuntimeAggregateRequest, RuntimeSearchRequest},
};
use crate::{
  runtime::{RuntimeError, RuntimeResult, SearchRuntimeConfig},
  search_index::EmbeddedSearchIndex,
};

pub(in crate::runtime::backend_runtime) struct SearchRuntime {
  pool: PgPool,
  store: SearchStore,
  authorizer: PermissionAuthorizer,
  pub(super) embedded: EmbeddedSearchIndex,
  remote: Option<RemoteProvider>,
  config: SearchRuntimeConfig,
  generation: RwLock<Option<ActiveGeneration>>,
  embedded_cursors: RwLock<[i64; 2]>,
  embedded_permission_cursors: RwLock<std::collections::HashMap<String, i64>>,
  sync_lock: Mutex<()>,
}

impl SearchRuntime {
  pub(in crate::runtime::backend_runtime) fn new(pool: PgPool, config: SearchRuntimeConfig) -> RuntimeResult<Self> {
    if !matches!(
      config.provider.as_str(),
      "embedded" | "elasticsearch" | "manticoresearch"
    ) {
      return Err(RuntimeError::config("unsupported search provider"));
    }
    let remote = (config.provider != "embedded")
      .then(|| RemoteProvider::new(&config, pool.clone()))
      .transpose()?;
    Ok(Self {
      store: SearchStore::new(pool.clone()),
      authorizer: PermissionAuthorizer::new(pool.clone()),
      embedded: EmbeddedSearchIndex::new(),
      remote,
      config,
      generation: RwLock::new(None),
      embedded_cursors: RwLock::new([0; 2]),
      embedded_permission_cursors: RwLock::new(std::collections::HashMap::new()),
      sync_lock: Mutex::new(()),
      pool,
    })
  }

  pub(in crate::runtime::backend_runtime) async fn initialize(&self) -> RuntimeResult<()> {
    let stream_count =
      sqlx::query_scalar::<_, i64>("SELECT count(*) FROM search_runtime_streams WHERE table_key IN ('doc', 'block')")
        .fetch_one(&self.pool)
        .await
        .map_err(|error| RuntimeError::database("check search runtime streams", error))?;
    if stream_count != SearchTable::ORDERED.len() as i64 {
      return Ok(());
    }
    let active = generation::prepare(&self.pool, &self.config, self.remote.as_ref()).await?;
    if let Err(error) = super::worker::rebuild(
      &self.pool,
      &self.store,
      &self.embedded,
      self.remote.as_ref(),
      &active,
      &self.embedded_cursors,
      true,
    )
    .await
    {
      generation::fail(&self.pool, &active).await?;
      return Err(error);
    }
    generation::activate(&self.pool, &active).await?;
    *self.generation.write().await = Some(active);
    Ok(())
  }

  async fn project_document(&self, workspace_id: &str, doc_id: &str) -> RuntimeResult<()> {
    match project_document(&self.pool, workspace_id, doc_id).await? {
      Some((document, blocks)) => self.store.replace_document(document, blocks).await?,
      None => {
        let revision = chrono::Utc::now().timestamp_millis();
        self.store.delete_document(workspace_id, doc_id, revision).await?;
      }
    }
    Ok(())
  }

  pub(in crate::runtime::backend_runtime) async fn project_document_only(
    &self,
    workspace_id: &str,
    doc_id: &str,
  ) -> RuntimeResult<()> {
    self.project_document(workspace_id, doc_id).await
  }

  pub(in crate::runtime::backend_runtime) async fn index_document(
    &self,
    workspace_id: &str,
    doc_id: &str,
  ) -> RuntimeResult<()> {
    self.project_document(workspace_id, doc_id).await?;
    self.sync().await?;
    self.refresh_permission_cursor(workspace_id).await
  }

  pub(in crate::runtime::backend_runtime) async fn delete_document_only(
    &self,
    workspace_id: &str,
    doc_id: &str,
  ) -> RuntimeResult<()> {
    self
      .store
      .delete_document(workspace_id, doc_id, chrono::Utc::now().timestamp_millis())
      .await?;
    Ok(())
  }

  pub(in crate::runtime::backend_runtime) async fn delete_document(
    &self,
    workspace_id: &str,
    doc_id: &str,
  ) -> RuntimeResult<()> {
    self.delete_document_only(workspace_id, doc_id).await?;
    self.sync().await?;
    self.refresh_permission_cursor(workspace_id).await
  }

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
      self
        .check_permission_revision(workspace_id, scope.permission_revision)
        .await?;
      let generation = self.active_generation().await?;
      self.ensure_query_ready(&generation).await?;
      let dsl = query::compile(&request, &scope)?;
      let result = if let Some(remote) = &self.remote {
        remote.search(generation.physical_table(request.table)?, dsl).await?
      } else {
        let result = self
          .embedded
          .search(
            request.table.as_str().to_string(),
            serde_json::to_string(&dsl).map_err(|error| RuntimeError::json("encode embedded search", error))?,
          )
          .await?;
        serde_json::from_str(&result).map_err(|error| RuntimeError::json("decode embedded search", error))?
      };
      if self.authorizer.revision(workspace_id).await? == scope.permission_revision {
        return Ok(result);
      }
      if attempt == 1 {
        return Err(RuntimeError::SearchPermissionUnavailable);
      }
    }
    unreachable!()
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
      self
        .check_permission_revision(workspace_id, scope.permission_revision)
        .await?;
      let generation = self.active_generation().await?;
      self.ensure_query_ready(&generation).await?;
      let dsl = query::compile_aggregate(&request, &scope)?;
      let result = if let Some(remote) = &self.remote {
        remote.aggregate(generation.physical_table(request.table)?, dsl).await?
      } else {
        let result = self
          .embedded
          .aggregate(
            request.table.as_str().to_string(),
            serde_json::to_string(&dsl).map_err(|error| RuntimeError::json("encode embedded aggregate", error))?,
          )
          .await?;
        let mut value: serde_json::Value =
          serde_json::from_str(&result).map_err(|error| RuntimeError::json("decode embedded aggregate", error))?;
        if let Some(buckets) = value.get_mut("buckets").and_then(serde_json::Value::as_array_mut) {
          for bucket in buckets {
            let hits = bucket
              .as_object_mut()
              .and_then(|bucket| bucket.remove("hits"))
              .unwrap_or_else(|| serde_json::json!([]));
            bucket["hits"] = serde_json::json!({"nodes":hits});
          }
        }
        value
      };
      if self.authorizer.revision(workspace_id).await? == scope.permission_revision {
        return Ok(result);
      }
      if attempt == 1 {
        return Err(RuntimeError::SearchPermissionUnavailable);
      }
    }
    unreachable!()
  }

  async fn active_generation(&self) -> RuntimeResult<ActiveGeneration> {
    if let Some(active) = self.generation.read().await.clone() {
      return Ok(active);
    }
    if let Some(active) = generation::load_active(&self.pool, &self.config).await? {
      *self.generation.write().await = Some(active.clone());
      return Ok(active);
    }
    Err(RuntimeError::invalid_state("search_runtime_not_ready"))
  }

  pub(super) async fn sync(&self) -> RuntimeResult<()> {
    let _guard = self.sync_lock.lock().await;
    let generation = self.active_generation().await?;
    let result = super::worker::sync(
      &self.pool,
      &self.store,
      &self.embedded,
      self.remote.as_ref(),
      &generation,
      &self.embedded_cursors,
    )
    .await;
    if matches!(result, Err(RuntimeError::SearchReplayGap)) && self.remote.is_none() {
      return super::worker::rebuild(
        &self.pool,
        &self.store,
        &self.embedded,
        None,
        &generation,
        &self.embedded_cursors,
        false,
      )
      .await;
    }
    result
  }

  async fn ensure_query_ready(&self, generation: &ActiveGeneration) -> RuntimeResult<()> {
    if self.remote.is_none() {
      let heads = sqlx::query_as::<_, (String, i64)>(
        "SELECT table_key,head FROM search_runtime_streams WHERE table_key IN ('doc','block')",
      )
      .fetch_all(&self.pool)
      .await
      .map_err(|error| RuntimeError::database("load embedded search stream heads", error))?;
      let cursors = *self.embedded_cursors.read().await;
      for (table, head) in heads {
        let cursor = cursors[if table == "doc" { 0 } else { 1 }];
        if cursor != head {
          return Err(RuntimeError::SearchProviderUnavailable);
        }
      }
      return Ok(());
    }

    let rows = sqlx::query_as::<_, (String, i64, i64)>(
      "SELECT streams.table_key,streams.head,cursors.source_cursor
       FROM search_runtime_streams streams
       JOIN search_runtime_provider_cursors cursors
         ON cursors.table_key=streams.table_key AND cursors.generation_id=$1
       WHERE streams.table_key IN ('doc','block')",
    )
    .bind(generation.id)
    .fetch_all(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("load remote search readiness", error))?;
    if rows.len() != SearchTable::ORDERED.len() || rows.iter().any(|(_, head, cursor)| head != cursor) {
      return Err(RuntimeError::SearchProviderUnavailable);
    }
    Ok(())
  }

  async fn check_permission_revision(&self, workspace_id: &str, revision: i64) -> RuntimeResult<()> {
    let generation = self.active_generation().await?;
    let applied = if self.remote.is_none() {
      self.embedded_permission_cursors.read().await.get(workspace_id).copied()
    } else {
      sqlx::query_scalar(
        "SELECT permission_revision FROM search_runtime_permission_cursors WHERE generation_id=$1 AND workspace_id=$2",
      )
      .bind(generation.id)
      .bind(workspace_id)
      .fetch_optional(&self.pool)
      .await
      .map_err(|error| RuntimeError::database("load search permission cursor", error))?
    };
    let applied = applied.unwrap_or_default();
    if applied >= revision {
      return Ok(());
    }
    Err(RuntimeError::SearchPermissionUnavailable)
  }

  async fn refresh_permission_cursor(&self, workspace_id: &str) -> RuntimeResult<()> {
    let revision: i64 = sqlx::query_scalar("SELECT revision FROM workspace_permission_revisions WHERE workspace_id=$1")
      .bind(workspace_id)
      .fetch_one(&self.pool)
      .await
      .map_err(|error| RuntimeError::database("load search permission revision", error))?;
    let generation = self.active_generation().await?;
    if self.remote.is_none() {
      let mut cursors = self.embedded_permission_cursors.write().await;
      let applied = cursors.entry(workspace_id.to_string()).or_insert(revision);
      *applied = (*applied).max(revision);
    } else {
      sqlx::query(
        r#"INSERT INTO search_runtime_permission_cursors(generation_id,workspace_id,permission_revision)
         VALUES ($1,$2,$3) ON CONFLICT (generation_id,workspace_id) DO UPDATE SET
         permission_revision=GREATEST(search_runtime_permission_cursors.permission_revision,EXCLUDED.permission_revision), updated_at=now()"#,
      )
      .bind(generation.id)
      .bind(workspace_id)
      .bind(revision)
      .execute(&self.pool)
      .await
      .map_err(|error| RuntimeError::database("advance search permission cursor", error))?;
    }
    Ok(())
  }

  pub(in crate::runtime::backend_runtime) async fn reconcile_workspace(
    &self,
    capability: SystemSearchCapability,
    workspace_id: &str,
  ) -> RuntimeResult<()> {
    match capability {
      SystemSearchCapability::ReconcileIndex => {}
    }
    let doc_ids: Vec<String> = sqlx::query_scalar("SELECT page_id FROM workspace_pages WHERE workspace_id=$1")
      .bind(workspace_id)
      .fetch_all(&self.pool)
      .await
      .map_err(|error| RuntimeError::database("load search workspace documents", error))?;
    let indexed_doc_ids: Vec<String> =
      sqlx::query_scalar("SELECT DISTINCT doc_id FROM search_runtime_projections WHERE workspace_id=$1")
        .bind(workspace_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|error| RuntimeError::database("load indexed workspace documents", error))?;
    let live_doc_ids = doc_ids.iter().cloned().collect::<std::collections::BTreeSet<_>>();
    for doc_id in doc_ids {
      self.project_document(workspace_id, &doc_id).await?;
    }
    let deletion_revision = chrono::Utc::now().timestamp_millis();
    for doc_id in indexed_doc_ids {
      if !live_doc_ids.contains(&doc_id) {
        self
          .store
          .delete_document(workspace_id, &doc_id, deletion_revision)
          .await?;
      }
    }
    self.sync().await?;
    self.refresh_permission_cursor(workspace_id).await
  }

  pub(in crate::runtime::backend_runtime) async fn delete_workspace(&self, workspace_id: &str) -> RuntimeResult<()> {
    let doc_ids: Vec<String> =
      sqlx::query_scalar("SELECT DISTINCT doc_id FROM search_runtime_projections WHERE workspace_id=$1")
        .bind(workspace_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|error| RuntimeError::database("load indexed workspace documents", error))?;
    for doc_id in doc_ids {
      self
        .store
        .delete_document(workspace_id, &doc_id, chrono::Utc::now().timestamp_millis())
        .await?;
    }
    self.sync().await?;
    self.refresh_permission_cursor(workspace_id).await
  }

  pub(in crate::runtime::backend_runtime) async fn status(&self) -> RuntimeResult<serde_json::Value> {
    let generation = match self.active_generation().await {
      Ok(generation) => generation,
      Err(RuntimeError::InvalidState(message)) if message == "search_runtime_not_ready" => {
        return Ok(serde_json::json!({
          "ready": false,
          "provider": self.config.provider,
          "tables": [],
        }));
      }
      Err(error) => return Err(error),
    };
    use sqlx::Row;
    let heads = sqlx::query(
      "SELECT table_key,head FROM search_runtime_streams WHERE table_key IN ('doc','block') ORDER BY table_key",
    )
    .fetch_all(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("load search runtime heads", error))?;
    let local_cursors = *self.embedded_cursors.read().await;
    let mut tables = Vec::with_capacity(heads.len());
    for row in heads {
      let table_key: String = row.get("table_key");
      let head: i64 = row.get("head");
      let cursor = if self.remote.is_none() {
        local_cursors[if table_key == "doc" { 0 } else { 1 }]
      } else {
        sqlx::query_scalar(
          "SELECT source_cursor FROM search_runtime_provider_cursors WHERE generation_id=$1 AND table_key=$2",
        )
        .bind(generation.id)
        .bind(&table_key)
        .fetch_one(&self.pool)
        .await
        .map_err(|error| RuntimeError::database("load search provider cursor", error))?
      };
      tables.push(serde_json::json!({"table":table_key,"head":head,"cursor":cursor,"lag":head-cursor}));
    }
    Ok(serde_json::json!({
      "ready":tables.len()==2 && tables.iter().all(|table|table["lag"]==0),
      "generationId":generation.id.to_string(),
      "provider":self.config.provider,
      "tables":tables,
    }))
  }
}
