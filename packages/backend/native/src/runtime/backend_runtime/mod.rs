use super::StorageOperation;
mod artifact;
mod auth_session;
mod blob_access;
mod byok;
mod byok_api;
mod constants;
mod control_plane;
mod copilot;
mod doc_compactor;
mod doc_storage;
mod doc_writer;
mod domain_command;
mod embedding;
mod embedding_api;
mod entitlement;
mod gate;
mod housekeeping;
mod invalidation;
mod lifecycle;
mod payment;
mod permission;
mod quota_read_cache;
mod role;
mod rolling_quota;
mod runtime_state;
mod scope_compiler;
mod search;
mod strict_quota;
#[cfg(test)]
mod tests;
use std::{
  sync::{Arc, RwLock},
  time::Duration,
};

use byok::LocalLeasePayload;
use copilot::{backend_provider, executable_protocol};
use embedding::register_artifact_source;
use napi::{Result, Status, bindgen_prelude::Buffer, threadsafe_function::ThreadsafeFunction};
#[cfg(test)]
pub(crate) use search::SEARCH_TEST_LOCK;
use search::SearchRuntime;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};
use tokio::sync::Mutex;

use self::{
  blob_access::SourceIdentity,
  entitlement::{
    ChargeSubject, load_decision_time, resolve_quota_charge, resolve_user_entitlement, resolve_workspace_entitlement,
  },
  invalidation::InvalidationHintV1,
  role::ServerRole,
  search::{RuntimeAggregateRequest, RuntimeSearchRequest},
  strict_quota::load_command_quota_in,
  types::{BackendRuntimeHealth, EmbeddingHealth, SearchOperationOutput},
};
use super::object_storage::ObjectStorageService;
pub(crate) use super::types;
pub(super) use super::{
  BackendRuntimeConfig, ConfigSource, InviteQuotaConfig, RedisRuntimeConfig, RuntimeError, RuntimeResult,
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

#[derive(Clone)]
#[napi_derive::napi]
pub struct BackendRuntime {
  config_source: ConfigSource,
  inline_config: Arc<RwLock<Option<serde_json::Value>>>,
  role: ServerRole,
  script_mode: bool,
  config: Arc<RwLock<Arc<BackendRuntimeConfig>>>,
  config_reload: Arc<Mutex<()>>,
  pool: Arc<Mutex<Option<PgPool>>>,
  embedding_health: Arc<RwLock<EmbeddingHealth>>,
  object_storage: Arc<RwLock<Arc<ObjectStorageService>>>,
  embedding: Arc<Mutex<Option<Arc<embedding::EmbeddingService>>>>,
  embedding_worker: Arc<Mutex<Option<embedding::EmbeddingWorker>>>,
  search: Arc<Mutex<Option<Arc<SearchRuntime>>>>,
  managed_token_providers: Arc<copilot::ManagedTokenProviderCache>,
  permission_telemetry: permission::PermissionTelemetry,
  blob_access: Arc<Mutex<Option<Arc<blob_access::BlobAccessService>>>>,
  invalidation: Arc<Mutex<Option<Arc<invalidation::InvalidationRuntime>>>>,
  invalidation_events: invalidation::InvalidationEvents,
  quota_read_cache: Arc<Mutex<Option<Arc<quota_read_cache::QuotaReadCache>>>>,
  payment: Arc<Mutex<Option<Arc<payment::PaymentRuntime>>>>,
  license_health_worker: Arc<Mutex<Option<entitlement::LicenseHealthWorker>>>,
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi(constructor)]
  pub fn new(
    private_key: Option<String>,
    config_paths: Option<Vec<String>>,
    permission_telemetry: Option<ThreadsafeFunction<String, (), String, Status, true, true, 1024>>,
    inline_config: Option<String>,
    invalidation_events: Option<ThreadsafeFunction<String, (), String, Status, true, true, 1024>>,
  ) -> Result<Self> {
    let config_source = ConfigSource::new(config_paths);
    let (role, script_mode) = ServerRole::from_environment().map_err(napi_error)?;
    let inline_config = inline_config
      .map(|value| serde_json::from_str(&value))
      .transpose()
      .map_err(|error| to_napi_error(RuntimeError::json("decode inline runtime config", error)))?;
    let config =
      BackendRuntimeConfig::from_config_source_with_inline(private_key, &config_source, inline_config.as_ref())
        .map_err(to_napi_error)?;
    let object_storage = ObjectStorageService::from_config_source(&config_source).map_err(to_napi_error)?;
    Ok(Self {
      config_source,
      inline_config: Arc::new(RwLock::new(inline_config)),
      role,
      script_mode,
      config: Arc::new(RwLock::new(Arc::new(config))),
      config_reload: Arc::new(Mutex::new(())),
      pool: Arc::new(Mutex::new(None)),
      embedding_health: Arc::new(RwLock::new(EmbeddingHealth::disabled("runtime_not_started", None))),
      object_storage: Arc::new(RwLock::new(Arc::new(object_storage))),
      embedding: Arc::new(Mutex::new(None)),
      embedding_worker: Arc::new(Mutex::new(None)),
      search: Arc::new(Mutex::new(None)),
      managed_token_providers: Arc::new(Default::default()),
      permission_telemetry: permission::PermissionTelemetry::from_threadsafe_function(permission_telemetry),
      blob_access: Arc::new(Mutex::new(None)),
      invalidation: Arc::new(Mutex::new(None)),
      invalidation_events: invalidation::InvalidationEvents::from_threadsafe_function(invalidation_events),
      quota_read_cache: Arc::new(Mutex::new(None)),
      payment: Arc::new(Mutex::new(None)),
      license_health_worker: Arc::new(Mutex::new(None)),
    })
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

  pub(crate) fn embedding_schema_ready(&self) -> RuntimeResult<bool> {
    self
      .embedding_health
      .read()
      .map(|health| health.schema_version.is_some())
      .map_err(|_| RuntimeError::invalid_state("embedding health lock poisoned"))
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

  async fn payment_runtime(&self) -> Result<Arc<payment::PaymentRuntime>> {
    self
      .payment
      .lock()
      .await
      .as_ref()
      .cloned()
      .ok_or_else(|| napi_error("payment_runtime_not_ready"))
  }
}

impl BackendRuntime {
  async fn apply_embedding_health(&self, pool: PgPool, mut health: EmbeddingHealth) -> RuntimeResult<()> {
    if self.script_mode {
      health.enabled = false;
      health.state = "disabled".to_string();
      health.reason = Some("script_runtime".to_string());
      health.worker_running = false;
    } else if health.enabled {
      let mut service = self.embedding.lock().await;
      if service.is_none() {
        let provider = copilot::BackgroundEmbeddingProvider::new(
          pool.clone(),
          Arc::clone(&self.config),
          Arc::clone(&self.managed_token_providers),
        );
        *service = Some(embedding::EmbeddingService::new(pool, self.object_storage()?, provider));
      }
      let embedding = service
        .as_ref()
        .cloned()
        .ok_or_else(|| RuntimeError::invalid_state("embedding service initialization failed"))?;
      drop(service);

      let mut worker = self.embedding_worker.lock().await;
      if worker.is_none()
        && self.role.owns_background()
        && (std::env::var("NODE_ENV").as_deref() != Ok("test")
          || std::env::var("AFFINE_EMBEDDING_WORKER").as_deref() == Ok("1"))
      {
        *worker = Some(embedding::EmbeddingWorker::start(embedding));
      }
      health.worker_running = worker.as_ref().is_some_and(embedding::EmbeddingWorker::is_running);
    }

    *self
      .embedding_health
      .write()
      .map_err(|_| RuntimeError::invalid_state("embedding health lock poisoned"))? = health;
    Ok(())
  }

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

use super::{entitlement_input_error, parse_quantity, parse_target_type};
