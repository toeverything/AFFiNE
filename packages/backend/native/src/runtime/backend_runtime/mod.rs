mod artifact;
mod byok;
mod constants;
mod coordination_lease;
mod copilot;
mod doc_compactor;
mod doc_storage;
mod embedding;
mod gate;
mod housekeeping;
mod permission;
mod role;
mod rolling_quota;
mod runtime_state;
mod scope_compiler;
mod search;
#[cfg(test)]
mod tests;
use std::{
  sync::{Arc, RwLock},
  time::Duration,
};

use byok::LocalLeasePayload;
use copilot::{backend_provider, executable_protocol};
use embedding::register_artifact_source;
use napi::{Result, bindgen_prelude::Buffer};
#[cfg(test)]
pub(crate) use search::SEARCH_TEST_LOCK;
use search::SearchRuntime;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use tokio::sync::Mutex;

use self::{
  role::ServerRole,
  search::{RuntimeAggregateRequest, RuntimeSearchRequest},
  types::{BackendRuntimeHealth, EmbeddingHealth, SearchOperationOutput},
};
use super::object_storage::ObjectStorageService;
pub(crate) use super::types;
pub(super) use super::{
  BackendRuntimeConfig, ConfigSource, InviteQuotaConfig, RuntimeError, RuntimeResult,
  migrations::{embedding_schema_health, migrate_all_tables},
  napi_error, to_napi_error, webpki_tls_config,
};
use crate::llm::{
  ByokLocalLeaseOutput, ByokPolicyOutput, ByokProbeResultOutput, ByokProfileOutput, CreateByokLocalLeaseInput,
  CreateByokProfileInput, ProbeByokDraftInput, ProbeByokProfileInput, ReorderByokProfilesInput,
  ReplaceByokProfileInput, RotateByokCredentialInput,
};

pub(super) fn token_hash(token: &str) -> String {
  hex::encode(Sha256::digest(token.as_bytes()))
}

fn search_operation_output(result: RuntimeResult<serde_json::Value>) -> SearchOperationOutput {
  match result {
    Ok(value) => SearchOperationOutput {
      ok: true,
      value: Some(value),
      error_code: None,
    },
    Err(error) => SearchOperationOutput {
      ok: false,
      value: None,
      error_code: Some(
        match error {
          RuntimeError::SearchWorkspaceDenied => "workspace_denied",
          RuntimeError::SearchPermissionUnavailable => "permission_syncing",
          RuntimeError::SearchIndexNotReady => "index_not_ready",
          RuntimeError::SearchPermissionSyncing => "permission_syncing",
          RuntimeError::SearchIndexFailed(_) => "index_failed",
          RuntimeError::SearchProviderUnavailable => "provider_unavailable",
          RuntimeError::SearchUnsupportedQuery => "unsupported_query",
          RuntimeError::InvalidInput(_) | RuntimeError::Json { .. } => "invalid_request",
          _ => "internal",
        }
        .to_string(),
      ),
    },
  }
}

#[napi_derive::napi]
pub struct BackendRuntime {
  config_source: ConfigSource,
  role: ServerRole,
  script_mode: bool,
  config: Arc<RwLock<Arc<BackendRuntimeConfig>>>,
  config_reload: Mutex<()>,
  pool: Mutex<Option<PgPool>>,
  embedding_health: RwLock<EmbeddingHealth>,
  object_storage: RwLock<Arc<ObjectStorageService>>,
  embedding: Mutex<Option<Arc<embedding::EmbeddingService>>>,
  embedding_worker: Mutex<Option<embedding::EmbeddingWorker>>,
  search: Mutex<Option<Arc<SearchRuntime>>>,
  managed_token_providers: Arc<copilot::ManagedTokenProviderCache>,
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi(constructor)]
  pub fn new(private_key: Option<String>, config_paths: Option<Vec<String>>) -> Result<Self> {
    let config_source = ConfigSource::new(config_paths);
    let (role, script_mode) = ServerRole::from_environment().map_err(napi_error)?;
    let config = BackendRuntimeConfig::from_config_source(private_key, &config_source).map_err(to_napi_error)?;
    let object_storage = ObjectStorageService::from_config_source(&config_source).map_err(to_napi_error)?;
    Ok(Self {
      config_source,
      role,
      script_mode,
      config: Arc::new(RwLock::new(Arc::new(config))),
      config_reload: Mutex::new(()),
      pool: Mutex::new(None),
      embedding_health: RwLock::new(EmbeddingHealth::disabled("runtime_not_started", None)),
      object_storage: RwLock::new(Arc::new(object_storage)),
      embedding: Mutex::new(None),
      embedding_worker: Mutex::new(None),
      search: Mutex::new(None),
      managed_token_providers: Arc::new(Default::default()),
    })
  }

  #[napi]
  pub async fn start(&self) -> Result<()> {
    self.start_inner().await.map_err(to_napi_error)
  }

  async fn start_inner(&self) -> RuntimeResult<()> {
    let mut guard = self.pool.lock().await;
    if guard.is_some() {
      return Ok(());
    }

    let config = self.config()?;
    let database_url = &config.database_url;
    let pool = PgPoolOptions::new()
      .max_connections(5)
      .acquire_timeout(Duration::from_secs(5))
      .connect(database_url)
      .await
      .map_err(|err| RuntimeError::database("BackendRuntime failed to connect postgres", err))?;

    sqlx::query("SELECT 1")
      .execute(&pool)
      .await
      .map_err(|err| RuntimeError::database("BackendRuntime postgres health check failed", err))?;

    let config = self.config()?.with_db_overrides(&pool, &self.config_source).await?;
    self.update_config(config)?;
    let object_storage = self.object_storage()?.with_db_overrides(&pool).await?;
    *self
      .object_storage
      .write()
      .map_err(|_| RuntimeError::invalid_state("object storage service lock poisoned"))? = Arc::new(object_storage);

    let embedding_health = if self.script_mode {
      EmbeddingHealth::disabled("script_runtime", None)
    } else {
      let config = self.config()?;
      if config.search.enabled {
        if config.search.provider == "embedded" && !self.role.allows_embedded_search() {
          return Err(RuntimeError::config(format!(
            "embedded search is only available for the allinone role (current role: {})",
            self.role.as_str()
          )));
        }
        let search = Arc::new(SearchRuntime::new(pool.clone(), config.search.clone())?);
        if self.role.owns_background() {
          search.initialize().await?;
        }
        *self.search.lock().await = Some(search);
      } else {
        *self.search.lock().await = None;
      }
      embedding_schema_health(&pool).await?
    };
    if self.script_mode {
      *self.search.lock().await = None;
    }
    if embedding_health.enabled {
      let provider = copilot::BackgroundEmbeddingProvider::new(
        pool.clone(),
        Arc::clone(&self.config),
        Arc::clone(&self.managed_token_providers),
      );
      let embedding = embedding::EmbeddingService::new(pool.clone(), self.object_storage()?, provider);
      if self.role.owns_background()
        && (std::env::var("NODE_ENV").as_deref() != Ok("test")
          || std::env::var("AFFINE_EMBEDDING_WORKER").as_deref() == Ok("1"))
      {
        *self.embedding_worker.lock().await = Some(embedding::EmbeddingWorker::start(Arc::clone(&embedding)));
      }
      let mut embedding_health = embedding_health;
      embedding_health.worker_running = self
        .embedding_worker
        .lock()
        .await
        .as_ref()
        .is_some_and(embedding::EmbeddingWorker::is_running);
      *self.embedding.lock().await = Some(embedding);
      *self
        .embedding_health
        .write()
        .map_err(|_| RuntimeError::invalid_state("embedding health lock poisoned"))? = embedding_health;
    } else {
      *self
        .embedding_health
        .write()
        .map_err(|_| RuntimeError::invalid_state("embedding health lock poisoned"))? = embedding_health;
    }

    *guard = Some(pool);
    Ok(())
  }

  #[napi]
  pub async fn stop(&self) -> Result<()> {
    self.search.lock().await.take();
    if let Some(worker) = self.embedding_worker.lock().await.take() {
      worker.stop().await;
    }
    self.embedding.lock().await.take();
    let pool = self.pool.lock().await.take();
    if let Some(pool) = pool {
      pool.close().await;
    }
    *self
      .embedding_health
      .write()
      .map_err(|_| napi_error("embedding health lock poisoned"))? =
      EmbeddingHealth::disabled("runtime_not_started", None);
    Ok(())
  }

  #[napi]
  pub async fn reload_config(&self, private_key: Option<String>) -> Result<()> {
    let _reload = self.config_reload.lock().await;
    let pool = self.pool().await.map_err(to_napi_error)?;
    let active_private_key = self.config().map_err(to_napi_error)?.private_key.to_string();
    let config =
      BackendRuntimeConfig::from_config_source(private_key.or(Some(active_private_key)), &self.config_source)
        .map_err(to_napi_error)?
        .with_db_overrides(&pool, &self.config_source)
        .await
        .map_err(to_napi_error)?;
    let object_storage = ObjectStorageService::from_config_source(&self.config_source)
      .map_err(to_napi_error)?
      .with_db_overrides(&pool)
      .await
      .map_err(to_napi_error)?;
    self.update_config(config).map_err(to_napi_error)?;
    if !self.script_mode {
      let config = self.config().map_err(to_napi_error)?;
      if config.search.enabled {
        if config.search.provider == "embedded" && !self.role.allows_embedded_search() {
          return Err(napi_error(format!(
            "embedded search is only available for the allinone role (current role: {})",
            self.role.as_str()
          )));
        }
        let search = Arc::new(SearchRuntime::new(pool.clone(), config.search.clone()).map_err(to_napi_error)?);
        if self.role.owns_background() {
          search.initialize().await.map_err(to_napi_error)?;
        }
        *self.search.lock().await = Some(search);
      } else {
        *self.search.lock().await = None;
      }
    } else {
      *self.search.lock().await = None;
    }
    let object_storage = Arc::new(object_storage);
    *self
      .object_storage
      .write()
      .map_err(|_| napi_error("object storage service lock poisoned"))? = Arc::clone(&object_storage);
    if let Some(embedding) = self.embedding.lock().await.as_ref() {
      embedding.reload_object_storage(object_storage).map_err(to_napi_error)?;
    }
    if self.role.owns_background() {
      let workspace_ids = sqlx::query_scalar::<_, String>("SELECT id FROM workspaces")
        .fetch_all(&pool)
        .await
        .map_err(|error| {
          to_napi_error(RuntimeError::database(
            "load workspaces for embedding reconciliation failed",
            error,
          ))
        })?;
      for workspace_id in workspace_ids {
        self.reconcile_embedding_workspace(&workspace_id).await?;
      }
    }
    Ok(())
  }

  #[napi]
  pub async fn health(&self) -> Result<BackendRuntimeHealth> {
    let pool = self.pool.lock().await.as_ref().cloned();
    let database_connected = match pool.as_ref() {
      Some(pool) => sqlx::query("SELECT 1")
        .fetch_one(pool)
        .await
        .map(|row| row.try_get::<i32, _>(0).unwrap_or(0) == 1)
        .unwrap_or(false),
      None => false,
    };

    Ok(BackendRuntimeHealth {
      started: pool.is_some(),
      database_connected,
      embedding: self
        .embedding_health
        .read()
        .map_err(|_| napi_error("embedding health lock poisoned"))?
        .clone(),
    })
  }

  #[napi]
  pub async fn run_migrations(&self) -> Result<()> {
    let pool = self.pool().await?;
    let embedding_health = migrate_all_tables(&pool).await.map_err(to_napi_error)?;
    *self
      .embedding_health
      .write()
      .map_err(|_| napi_error("embedding health lock poisoned"))? = embedding_health;
    Ok(())
  }

  #[napi]
  pub async fn search_authorized(
    &self,
    actor_user_id: String,
    workspace_id: String,
    request: RuntimeSearchRequest,
  ) -> Result<SearchOperationOutput> {
    let result = self
      .search_runtime()
      .await?
      .search_authorized(&actor_user_id, &workspace_id, request)
      .await;
    Ok(search_operation_output(result))
  }

  #[napi]
  pub async fn aggregate_authorized(
    &self,
    actor_user_id: String,
    workspace_id: String,
    request: RuntimeAggregateRequest,
  ) -> Result<SearchOperationOutput> {
    let result = self
      .search_runtime()
      .await?
      .aggregate_authorized(&actor_user_id, &workspace_id, request)
      .await;
    Ok(search_operation_output(result))
  }

  #[napi]
  pub async fn reconcile_search_projection(&self, limit: Option<i32>) -> Result<i32> {
    self.require_background()?;
    self
      .search_runtime()
      .await?
      .reconcile_pending(limit.unwrap_or(100))
      .await
      .map(|count| count as i32)
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn filter_readable_docs(
    &self,
    actor_user_id: String,
    workspace_id: String,
    doc_ids: Vec<String>,
  ) -> Result<Vec<String>> {
    let authorizer = permission::PermissionAuthorizer::new(self.pool().await?);
    authorizer
      .filter_readable_docs(&workspace_id, &actor_user_id, doc_ids)
      .await
      .map(|ids| ids.into_iter().collect())
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn search_status(&self) -> Result<serde_json::Value> {
    self.search_runtime().await?.status().await.map_err(to_napi_error)
  }

  #[napi]
  pub async fn embedding_health(&self) -> Result<EmbeddingHealth> {
    self
      .embedding_health
      .read()
      .map(|health| health.clone())
      .map_err(|_| napi_error("embedding health lock poisoned"))
  }

  #[napi]
  pub async fn sync_embedding_state(
    &self,
    input: types::SyncEmbeddingStateInput,
  ) -> Result<types::RuntimeEmbeddingWorkspaceState> {
    let embedding = self
      .embedding
      .lock()
      .await
      .as_ref()
      .cloned()
      .ok_or_else(|| napi_error("embedding_unavailable"))?;
    let target = if input.enabled {
      match self.resolve_background_embedding_target(&input.workspace_id).await {
        Ok(target) => Some(embedding::EmbeddingTarget {
          fingerprint: target.fingerprint,
          route_source: target.route_source.to_string(),
          provider: target.provider,
          model_id: target.model_id,
          endpoint_fingerprint: target.endpoint_fingerprint,
        }),
        Err(RuntimeError::InvalidState(reason) | RuntimeError::InvalidInput(reason))
          if matches!(
            reason.as_str(),
            "embedding_route_unavailable"
              | "no_compatible_target"
              | "managed_preset_unavailable"
              | "byok_disabled"
              | "copilot_disabled"
          ) =>
        {
          None
        }
        Err(error) => return Err(to_napi_error(error)),
      }
    } else {
      None
    };
    let state = embedding
      .sync_workspace(&input.workspace_id, input.enabled, target)
      .await
      .map_err(to_napi_error)?;
    let reconcile_documents = input.reconcile_documents.unwrap_or(false);
    let priority = input.priority.unwrap_or(100);
    if !(0..=1000).contains(&priority) {
      return Err(napi_error("embedding_priority_invalid"));
    }
    if let Some(documents) = input.documents {
      if input.wait_for_ready_ms.is_some() && state.active_index_id.is_none() {
        return Err(napi_error("embedding_selected_sources_unavailable"));
      }
      embedding
        .sync_documents(&input.workspace_id, &documents, reconcile_documents, priority)
        .await
        .map_err(to_napi_error)?;
      if let Some(wait_ms) = input.wait_for_ready_ms {
        if wait_ms == 0 || wait_ms > 120_000 {
          return Err(napi_error("embedding_wait_timeout_invalid"));
        }
        embedding
          .wait_for_documents(
            &input.workspace_id,
            &documents,
            Duration::from_millis(u64::from(wait_ms)),
          )
          .await
          .map_err(to_napi_error)?;
      }
    } else if reconcile_documents {
      embedding
        .reconcile_documents(&input.workspace_id)
        .await
        .map_err(to_napi_error)?;
    }
    Ok(types::RuntimeEmbeddingWorkspaceState {
      workspace_id: state.workspace_id,
      active_index_id: state.active_index_id.map(|id| id.to_string()),
      index_epoch: state.index_epoch,
      runtime_state: state.runtime_state,
      reason_code: state.reason_code,
    })
  }

  #[napi]
  pub async fn embedding_queue_counts(&self) -> Result<types::RuntimeEmbeddingQueueCounts> {
    let embedding = self
      .embedding
      .lock()
      .await
      .as_ref()
      .cloned()
      .ok_or_else(|| napi_error("embedding_unavailable"))?;
    let counts = embedding.health_counts().await.map_err(to_napi_error)?;
    Ok(types::RuntimeEmbeddingQueueCounts {
      pending: counts.pending,
      running: counts.running,
      retry_wait: counts.retry_wait,
      ready: counts.ready,
      failed: counts.failed,
      expired_leases: counts.expired_leases,
      oldest_pending_seconds: counts.oldest_pending_seconds,
      active_vector_rows: counts.active_vector_rows,
      inactive_vector_rows: counts.inactive_vector_rows,
      index_bytes: counts.index_bytes,
      retrying_indexes: counts.retrying_indexes,
      max_index_retry_seconds: counts.max_index_retry_seconds,
    })
  }

  #[napi]
  pub async fn embedding_workspace_progress(&self, workspace_id: String) -> Result<types::RuntimeEmbeddingProgress> {
    let row = sqlx::query(
      r#"SELECT count(*)::bigint total,
        count(*) FILTER (WHERE projection.status='ready')::bigint embedded
      FROM embedding_sources source
      JOIN embedding_workspace_states state ON state.workspace_id=source.workspace_id
      LEFT JOIN embedding_projections projection
        ON projection.source_id=source.id AND projection.index_id=state.active_index_id
      WHERE source.workspace_id=$1 AND source.deleted_at IS NULL"#,
    )
    .bind(workspace_id)
    .fetch_one(&self.pool().await?)
    .await
    .map_err(|error| {
      to_napi_error(RuntimeError::database(
        "load embedding workspace progress failed",
        error,
      ))
    })?;
    Ok(types::RuntimeEmbeddingProgress {
      total: row
        .try_get("total")
        .map_err(|error| to_napi_error(RuntimeError::database("decode embedding source total failed", error)))?,
      embedded: row
        .try_get("embedded")
        .map_err(|error| to_napi_error(RuntimeError::database("decode embedded source total failed", error)))?,
    })
  }

  #[napi]
  pub async fn reconcile_embedding_workspaces(&self) -> Result<i64> {
    self.require_background()?;
    let workspace_ids = sqlx::query_scalar::<_, String>("SELECT id FROM workspaces")
      .fetch_all(&self.pool().await?)
      .await
      .map_err(|error| to_napi_error(RuntimeError::database("load embedding workspaces failed", error)))?;
    for workspace_id in &workspace_ids {
      self.reconcile_embedding_workspace(workspace_id).await?;
    }
    Ok(workspace_ids.len() as i64)
  }

  #[napi]
  pub async fn put_workspace_artifact(
    &self,
    input: types::PutWorkspaceArtifactInput,
    body: Buffer,
  ) -> Result<types::RuntimeWorkspaceArtifact> {
    artifact::ArtifactService::new(self.pool().await?, self.object_storage()?)
      .put(input, body.to_vec())
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn ensure_workspace_blob_artifact(
    &self,
    input: types::EnsureWorkspaceBlobArtifactInput,
  ) -> Result<types::RuntimeWorkspaceArtifact> {
    artifact::ArtifactService::new(self.pool().await?, self.object_storage()?)
      .alias_blob(input)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn cleanup_unreferenced_artifacts(&self, limit: i64) -> Result<i64> {
    self.require_background()?;
    if limit <= 0 {
      return Err(napi_error("artifact cleanup limit must be positive"));
    }
    artifact::ArtifactService::new(self.pool().await?, self.object_storage()?)
      .cleanup(limit)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn set_artifact_library_owned(
    &self,
    workspace_id: String,
    artifact_id: String,
    library_owned: bool,
    display_name: Option<String>,
  ) -> Result<types::RuntimeWorkspaceArtifact> {
    artifact::ArtifactService::new(self.pool().await?, self.object_storage()?)
      .set_library_owned(&workspace_id, &artifact_id, library_owned, display_name)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn compile_turn_scope(&self, input: types::CompileScopeInput) -> Result<types::RuntimeTurnScopeSnapshot> {
    scope_compiler::ScopeCompiler::new(self.pool().await?)
      .compile(input)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn read_embedding_source_content(
    &self,
    input: types::ReadEmbeddingSourceContentInput,
  ) -> Result<types::RuntimeEmbeddingSourceContent> {
    self
      .embedding_service()
      .await?
      .read_source_content(&input)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn match_embedding_candidates(
    &self,
    input: types::MatchEmbeddingCandidatesInput,
  ) -> Result<Vec<types::RuntimeEmbeddingCandidate>> {
    self
      .embedding_service()
      .await?
      .match_candidates(&input)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn cancel_embedding_candidate_request(&self, request_id: String) -> Result<()> {
    self
      .embedding_service()
      .await?
      .cancel_candidate_request(&request_id)
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn list_byok_profiles(&self, workspace_id: String) -> Result<Vec<ByokProfileOutput>> {
    byok::list(&self.pool().await?, &workspace_id)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub fn get_byok_policy(&self) -> Result<ByokPolicyOutput> {
    Ok(self.config()?.byok_policy().project())
  }

  #[napi]
  pub async fn create_byok_profile(&self, input: CreateByokProfileInput) -> Result<ByokProfileOutput> {
    let workspace_id = input.workspace_id.clone();
    let config = self.config()?;
    let policy = config.byok_policy();
    let profile = byok::create(&self.pool().await?, config.private_key.as_bytes(), &policy, input)
      .await
      .map_err(to_napi_error)?;
    self.reconcile_embedding_workspace(&workspace_id).await?;
    Ok(profile)
  }

  #[napi]
  pub async fn replace_byok_profile(&self, input: ReplaceByokProfileInput) -> Result<ByokProfileOutput> {
    let workspace_id = input.workspace_id.clone();
    let config = self.config()?;
    let policy = config.byok_policy();
    let profile = byok::replace(&self.pool().await?, config.private_key.as_bytes(), &policy, input)
      .await
      .map_err(to_napi_error)?;
    self.reconcile_embedding_workspace(&workspace_id).await?;
    Ok(profile)
  }

  #[napi]
  pub async fn rotate_byok_credential(&self, input: RotateByokCredentialInput) -> Result<ByokProfileOutput> {
    let workspace_id = input.workspace_id.clone();
    let config = self.config()?;
    let profile = byok::rotate(&self.pool().await?, config.private_key.as_bytes(), input)
      .await
      .map_err(to_napi_error)?;
    self.reconcile_embedding_workspace(&workspace_id).await?;
    Ok(profile)
  }

  #[napi]
  pub async fn probe_byok_profile(&self, input: ProbeByokProfileInput) -> Result<ByokProbeResultOutput> {
    let config = self.config()?;
    let policy = config.byok_policy();
    byok::probe_profile(&self.pool().await?, config.private_key.as_bytes(), &policy, input)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn probe_byok_draft(&self, input: ProbeByokDraftInput) -> Result<ByokProbeResultOutput> {
    let config = self.config()?;
    let policy = config.byok_policy();
    byok::probe_draft(&self.pool().await?, config.private_key.as_bytes(), &policy, input)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn delete_byok_profile(&self, workspace_id: String, profile_id: String) -> Result<bool> {
    let deleted = byok::delete(&self.pool().await?, &workspace_id, &profile_id)
      .await
      .map_err(to_napi_error)?;
    self.reconcile_embedding_workspace(&workspace_id).await?;
    Ok(deleted)
  }

  #[napi]
  pub async fn reorder_byok_profiles(&self, input: ReorderByokProfilesInput) -> Result<Vec<ByokProfileOutput>> {
    let workspace_id = input.workspace_id.clone();
    let profiles = byok::reorder(&self.pool().await?, input).await.map_err(to_napi_error)?;
    self.reconcile_embedding_workspace(&workspace_id).await?;
    Ok(profiles)
  }

  #[napi]
  pub async fn create_byok_local_lease(&self, input: CreateByokLocalLeaseInput) -> Result<ByokLocalLeaseOutput> {
    let config = self.config()?;
    let policy = config.byok_policy();
    byok::create_local_lease(&self.pool().await?, config.private_key.as_bytes(), &policy, input)
      .await
      .map_err(to_napi_error)
  }

  pub(crate) async fn pool(&self) -> RuntimeResult<PgPool> {
    self
      .pool
      .lock()
      .await
      .as_ref()
      .cloned()
      .ok_or_else(|| RuntimeError::invalid_state("BackendRuntime must be started before using postgres operations"))
  }

  fn require_background(&self) -> Result<()> {
    if self.role.owns_background() {
      Ok(())
    } else {
      Err(napi_error(format!(
        "backend runtime role {} does not own background work",
        self.role.as_str()
      )))
    }
  }

  async fn search_runtime(&self) -> Result<Arc<SearchRuntime>> {
    self
      .search
      .lock()
      .await
      .as_ref()
      .cloned()
      .ok_or_else(|| napi_error("search_provider_not_ready"))
  }

  async fn reconcile_embedding_workspace(&self, workspace_id: &str) -> Result<()> {
    let enabled = sqlx::query_scalar::<_, bool>("SELECT enable_doc_embedding FROM workspaces WHERE id=$1")
      .bind(workspace_id)
      .fetch_optional(&self.pool().await?)
      .await
      .map_err(|error| to_napi_error(RuntimeError::database("load workspace embedding setting failed", error)))?
      .unwrap_or(false);
    self
      .sync_embedding_state(types::SyncEmbeddingStateInput {
        workspace_id: workspace_id.to_string(),
        enabled,
        documents: None,
        reconcile_documents: None,
        priority: None,
        wait_for_ready_ms: None,
      })
      .await?;
    Ok(())
  }

  pub(crate) fn config(&self) -> RuntimeResult<Arc<BackendRuntimeConfig>> {
    self
      .config
      .read()
      .map(|config| Arc::clone(&config))
      .map_err(|_| RuntimeError::invalid_state("BackendRuntime config lock poisoned"))
  }

  pub(crate) fn object_storage(&self) -> RuntimeResult<Arc<ObjectStorageService>> {
    self
      .object_storage
      .read()
      .map(|service| Arc::clone(&service))
      .map_err(|_| RuntimeError::invalid_state("object storage service lock poisoned"))
  }

  fn update_config(&self, config: BackendRuntimeConfig) -> RuntimeResult<()> {
    self
      .managed_token_providers
      .write()
      .map_err(|_| RuntimeError::invalid_state("managed token provider cache lock poisoned"))?
      .clear();
    *self
      .config
      .write()
      .map_err(|_| RuntimeError::invalid_state("BackendRuntime config lock poisoned"))? = Arc::new(config);
    Ok(())
  }
}

impl BackendRuntime {
  async fn embedding_service(&self) -> Result<Arc<embedding::EmbeddingService>> {
    self
      .embedding
      .lock()
      .await
      .as_ref()
      .cloned()
      .ok_or_else(|| napi_error("embedding_unavailable"))
  }
}
