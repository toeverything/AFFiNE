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
mod rolling_quota;
mod runtime_state;
mod scope_compiler;
#[cfg(test)]
mod tests;
mod workspace_stats;
use std::{
  sync::{Arc, RwLock},
  time::Duration,
};

use byok::LocalLeasePayload;
use copilot::{backend_provider, executable_protocol};
use embedding::register_artifact_source;
use napi::{Result, bindgen_prelude::Buffer};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use tokio::sync::Mutex;

use self::types::{BackendRuntimeHealth, EmbeddingHealth};
use super::object_storage::ObjectStorageService;
pub(crate) use super::types;
pub(super) use super::{
  BackendRuntimeConfig, InviteQuotaConfig, RuntimeError, RuntimeResult,
  migrations::{migrate_embedding_tables, migrate_runtime_tables},
  napi_error, to_napi_error,
};
use crate::llm::{
  ByokLocalLeaseOutput, ByokPolicyOutput, ByokProbeResultOutput, ByokProfileOutput, CreateByokLocalLeaseInput,
  CreateByokProfileInput, ProbeByokDraftInput, ProbeByokProfileInput, ReorderByokProfilesInput,
  ReplaceByokProfileInput, RotateByokCredentialInput,
};

pub(super) fn token_hash(token: &str) -> String {
  hex::encode(Sha256::digest(token.as_bytes()))
}

#[napi_derive::napi]
pub struct BackendRuntime {
  config: Arc<RwLock<Arc<BackendRuntimeConfig>>>,
  pool: Mutex<Option<PgPool>>,
  embedding_health: RwLock<EmbeddingHealth>,
  object_storage: RwLock<Arc<ObjectStorageService>>,
  embedding: Mutex<Option<Arc<embedding::EmbeddingService>>>,
  managed_token_providers: Arc<copilot::ManagedTokenProviderCache>,
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi(constructor)]
  pub fn new(private_key: Option<String>) -> Result<Self> {
    let config = BackendRuntimeConfig::from_config_files(private_key).map_err(to_napi_error)?;
    let object_storage = ObjectStorageService::from_config_files().map_err(to_napi_error)?;
    Ok(Self {
      config: Arc::new(RwLock::new(Arc::new(config))),
      pool: Mutex::new(None),
      embedding_health: RwLock::new(EmbeddingHealth::disabled("runtime_not_started", None)),
      object_storage: RwLock::new(Arc::new(object_storage)),
      embedding: Mutex::new(None),
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

    let config = self.config()?.with_db_overrides(&pool).await?;
    self.update_config(config)?;
    let object_storage = self.object_storage()?.with_db_overrides(&pool).await?;
    *self
      .object_storage
      .write()
      .map_err(|_| RuntimeError::invalid_state("object storage service lock poisoned"))? = Arc::new(object_storage);

    let mut embedding_health = migrate_embedding_tables(&pool).await;
    if embedding_health.enabled {
      let provider = copilot::BackgroundEmbeddingProvider::new(
        pool.clone(),
        Arc::clone(&self.config),
        Arc::clone(&self.managed_token_providers),
      );
      let embedding = embedding::EmbeddingService::new(pool.clone(), self.object_storage()?, provider);
      if std::env::var("NODE_ENV").as_deref() != Ok("test")
        || std::env::var("AFFINE_EMBEDDING_WORKER").as_deref() == Ok("1")
      {
        embedding.start().await;
      }
      embedding_health.worker_running = embedding.is_running().await;
      *self.embedding.lock().await = Some(embedding);
    }
    *self
      .embedding_health
      .write()
      .map_err(|_| RuntimeError::invalid_state("embedding health lock poisoned"))? = embedding_health;

    *guard = Some(pool);
    Ok(())
  }

  #[napi]
  pub async fn stop(&self) -> Result<()> {
    if let Some(embedding) = self.embedding.lock().await.take() {
      embedding.stop().await;
    }
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
    let pool = self.pool().await.map_err(to_napi_error)?;
    let active_private_key = self.config().map_err(to_napi_error)?.private_key.to_string();
    let config = BackendRuntimeConfig::from_config_files(private_key.or(Some(active_private_key)))
      .map_err(to_napi_error)?
      .with_db_overrides(&pool)
      .await
      .map_err(to_napi_error)?;
    let object_storage = ObjectStorageService::from_config_files()
      .map_err(to_napi_error)?
      .with_db_overrides(&pool)
      .await
      .map_err(to_napi_error)?;
    self.update_config(config).map_err(to_napi_error)?;
    let object_storage = Arc::new(object_storage);
    *self
      .object_storage
      .write()
      .map_err(|_| napi_error("object storage service lock poisoned"))? = Arc::clone(&object_storage);
    if let Some(embedding) = self.embedding.lock().await.as_ref() {
      embedding.reload_object_storage(object_storage).map_err(to_napi_error)?;
    }
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
    migrate_runtime_tables(&pool).await.map_err(to_napi_error)
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
    if let Some(documents) = input.documents {
      embedding
        .sync_documents(&input.workspace_id, &documents, reconcile_documents)
        .await
        .map_err(to_napi_error)?;
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
  ) -> Result<types::RuntimeWorkspaceArtifact> {
    artifact::ArtifactService::new(self.pool().await?, self.object_storage()?)
      .set_library_owned(&workspace_id, &artifact_id, library_owned)
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
