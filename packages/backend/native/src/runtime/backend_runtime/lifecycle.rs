use std::{sync::Arc, time::Duration};

use napi::Result;
use sqlx::{Row, postgres::PgPoolOptions};

use super::{
  BackendRuntime, BackendRuntimeConfig, BackendRuntimeHealth, EmbeddingHealth, ObjectStorageService, RuntimeError,
  RuntimeResult, SearchRuntime, blob_access, embedding_schema_health, invalidation,
  invalidation::{InvalidationHintV1, InvalidationTarget},
  napi_error,
  payment::PaymentRuntime,
  quota_read_cache, to_napi_error,
};

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub fn configure_object_storage(&self, config_json: String) -> Result<()> {
    let object_storage = ObjectStorageService::from_config_json(&config_json).map_err(to_napi_error)?;
    *self
      .object_storage
      .write()
      .map_err(|_| napi_error("object storage service lock poisoned"))? = Arc::new(object_storage);
    Ok(())
  }

  #[napi]
  pub async fn start(&self) -> Result<()> {
    self.start_inner().await.map_err(to_napi_error)
  }

  pub(super) async fn start_inner(&self) -> RuntimeResult<()> {
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

    let initialized = async {
      let inline_config = self
        .inline_config
        .read()
        .map_err(|_| RuntimeError::invalid_state("BackendRuntime inline config lock poisoned"))?
        .clone();
      let config = self
        .config()?
        .with_db_overrides(&pool, &self.config_source, inline_config.as_ref())
        .await?;
      let deployment = config.deployment;
      let redis = config.redis.clone();
      self.update_config(config)?;
      let config = self.config()?;
      let payment = if config.payment.enabled || config.payment.revenuecat.is_some() {
        Some(Arc::new(
          PaymentRuntime::new(
            &config.database_url,
            &config.payment,
            config.deployment,
            config.private_key.as_str(),
          )
          .await?,
        ))
      } else {
        None
      };
      *self.payment.lock().await = payment;
      let object_storage = self.object_storage()?.with_db_overrides(&pool).await?;
      *self
        .object_storage
        .write()
        .map_err(|_| RuntimeError::invalid_state("object storage service lock poisoned"))? = Arc::new(object_storage);
      let blob_access = self.role.owns_read_cache().then(|| {
        Arc::new(blob_access::BlobAccessService::new(
          pool.clone(),
          self.object_storage().expect("object storage initialized"),
          deployment,
          self.permission_telemetry.clone(),
        ))
      });
      if let Some(service) = blob_access.as_ref() {
        service.start_stream_cleanup();
      }
      *self.blob_access.lock().await = blob_access.clone();
      let quota_read_cache = self.role.owns_read_cache().then(|| {
        Arc::new(quota_read_cache::QuotaReadCache::new(
          pool.clone(),
          deployment,
          self.permission_telemetry.clone(),
        ))
      });
      *self.quota_read_cache.lock().await = quota_read_cache.clone();
      if !self.script_mode {
        let mut targets: Vec<Arc<dyn invalidation::InvalidationTarget>> = Vec::with_capacity(3);
        if let Some(service) = blob_access {
          targets.push(service);
        }
        if let Some(cache) = quota_read_cache {
          targets.push(cache);
        }
        targets.push(Arc::new(invalidation::EventInvalidationTarget(
          self.invalidation_events.clone(),
        )));
        let target = Arc::new(invalidation::CompositeInvalidationTarget(targets));
        *self.invalidation.lock().await =
          Some(invalidation::InvalidationRuntime::start(&redis, self.role.owns_read_cache(), target).await);
      }
      if !self.script_mode && deployment == crate::runtime::Deployment::SelfHosted {
        self.admit_offline_licenses(&pool).await?;
      }
      if payment_worker_enabled(self.role) {
        let payment = self.payment.lock().await.as_ref().cloned();
        let invalidation = self.invalidation.lock().await.as_ref().cloned();
        if let (Some(payment), Some(invalidation)) = (payment, invalidation) {
          payment.start_worker(invalidation).await;
        }
      }

      let embedding_health = embedding_schema_health(&pool).await?;
      if !self.script_mode {
        let config = self.config()?;
        if config.search.enabled {
          if config.search.provider == "embedded" && !self.role.allows_embedded_search() {
            return Err(RuntimeError::config(format!(
              "embedded search is only available for the allinone role (current role: {})",
              self.role.as_str()
            )));
          }
          let search = Arc::new(SearchRuntime::with_telemetry(
            pool.clone(),
            config.search.clone(),
            config.deployment,
            self.permission_telemetry.clone(),
          )?);
          if self.role.owns_background() {
            search.initialize().await?;
          }
          *self.search.lock().await = Some(search);
        } else {
          *self.search.lock().await = None;
        }
      }
      if self.script_mode {
        *self.search.lock().await = None;
      }
      self.apply_embedding_health(pool.clone(), embedding_health).await
    }
    .await;
    if let Err(error) = initialized {
      self.rollback_start().await;
      pool.close().await;
      return Err(error);
    }

    *guard = Some(pool);
    drop(guard);
    if !self.script_mode && self.config()?.deployment == crate::runtime::Deployment::SelfHosted {
      let result = tokio::time::timeout(std::time::Duration::from_secs(30), self.check_licenses(true)).await;
      let (outcome, changes) = match result {
        Ok(Ok(result)) => (
          if result.transient_failure { "partial" } else { "success" },
          result.changes.len(),
        ),
        _ => ("error", 0),
      };
      self.permission_telemetry.license_health(outcome, changes);
    }
    self.sync_license_health_worker().await?;
    Ok(())
  }

  async fn rollback_start(&self) {
    if let Some(worker) = self.license_health_worker.lock().await.take() {
      worker.stop().await;
    }
    if let Some(payment) = self.payment.lock().await.take() {
      payment.stop().await;
    }
    if let Some(invalidation) = self.invalidation.lock().await.take() {
      invalidation.stop().await;
    }
    self.search.lock().await.take();
    if let Some(worker) = self.embedding_worker.lock().await.take() {
      worker.stop().await;
    }
    self.embedding.lock().await.take();
    self.blob_access.lock().await.take();
    if let Some(cache) = self.quota_read_cache.lock().await.take() {
      cache.flush_metrics().await;
    }
    if let Ok(mut health) = self.embedding_health.write() {
      *health = EmbeddingHealth::disabled("runtime_not_started", None);
    }
  }

  pub(super) async fn publish_invalidation(&self, hint: InvalidationHintV1) {
    if let Some(invalidation) = self.invalidation.lock().await.as_ref().cloned() {
      invalidation.publish(hint).await;
      return;
    }
    if let Some(cache) = self.quota_read_cache.lock().await.as_ref().cloned() {
      cache.invalidate(&hint).await;
    }
    if let Some(blob_access) = self.blob_access.lock().await.as_ref().cloned() {
      blob_access.invalidate(&hint).await;
    }
  }

  #[napi]
  pub async fn stop(&self) -> Result<()> {
    self.rollback_start().await;
    let pool = self.pool.lock().await.take();
    if let Some(pool) = pool {
      pool.close().await;
    }
    self.permission_telemetry.shutdown();
    self.invalidation_events.shutdown();
    Ok(())
  }

  #[napi]
  pub async fn reload_config(
    &self,
    private_key: Option<String>,
    object_storage_config: Option<String>,
    inline_config: Option<String>,
  ) -> Result<()> {
    let _reload = self.config_reload.lock().await;
    let pool = self.pool().await.map_err(to_napi_error)?;
    let active_private_key = self.config().map_err(to_napi_error)?.private_key.to_string();
    let inline_config = inline_config
      .map(|value| serde_json::from_str(&value))
      .transpose()
      .map_err(|error| to_napi_error(RuntimeError::json("decode inline runtime config", error)))?
      .or_else(|| self.inline_config.read().ok().and_then(|value| value.clone()));
    let config = BackendRuntimeConfig::from_config_source_with_inline(
      private_key.or(Some(active_private_key)),
      &self.config_source,
      inline_config.as_ref(),
    )
    .map_err(to_napi_error)?
    .with_db_overrides(&pool, &self.config_source, inline_config.as_ref())
    .await
    .map_err(to_napi_error)?;
    let object_storage = match object_storage_config {
      Some(config) => ObjectStorageService::from_config_json(&config).map_err(to_napi_error)?,
      None => self.object_storage().map_err(to_napi_error)?.as_ref().clone(),
    }
    .with_db_overrides(&pool)
    .await
    .map_err(to_napi_error)?;
    let search = if !self.script_mode && config.search.enabled {
      if config.search.provider == "embedded" && !self.role.allows_embedded_search() {
        return Err(napi_error(format!(
          "embedded search is only available for the allinone role (current role: {})",
          self.role.as_str()
        )));
      }
      let search = Arc::new(
        SearchRuntime::with_telemetry(
          pool.clone(),
          config.search.clone(),
          config.deployment,
          self.permission_telemetry.clone(),
        )
        .map_err(to_napi_error)?,
      );
      if self.role.owns_background() {
        search.initialize().await.map_err(to_napi_error)?;
      }
      Some(search)
    } else {
      None
    };
    let object_storage = Arc::new(object_storage);
    let blob_access = self.role.owns_read_cache().then(|| {
      Arc::new(blob_access::BlobAccessService::new(
        pool.clone(),
        object_storage.clone(),
        config.deployment,
        self.permission_telemetry.clone(),
      ))
    });
    let quota_read_cache = self.role.owns_read_cache().then(|| {
      Arc::new(quota_read_cache::QuotaReadCache::new(
        pool.clone(),
        config.deployment,
        self.permission_telemetry.clone(),
      ))
    });
    let payment = if config.payment.enabled || config.payment.revenuecat.is_some() {
      Some(Arc::new(
        PaymentRuntime::new(
          &config.database_url,
          &config.payment,
          config.deployment,
          config.private_key.as_str(),
        )
        .await
        .map_err(to_napi_error)?,
      ))
    } else {
      None
    };
    *self
      .inline_config
      .write()
      .map_err(|_| napi_error("BackendRuntime inline config lock poisoned"))? = inline_config;

    let embedding = self.embedding.lock().await.as_ref().cloned();
    if let Some(embedding) = embedding {
      embedding
        .reload_object_storage(Arc::clone(&object_storage))
        .map_err(to_napi_error)?;
    }
    let redis_config = config.redis.clone();
    let invalidation_blob_access = blob_access.clone();
    let invalidation_quota_cache = quota_read_cache.clone();
    let active_payment = payment.clone();
    let (previous_cache, previous_payment) = {
      let mut search_guard = self.search.lock().await;
      let mut blob_access_guard = self.blob_access.lock().await;
      let mut quota_cache_guard = self.quota_read_cache.lock().await;
      let mut payment_guard = self.payment.lock().await;
      let mut token_providers = self
        .managed_token_providers
        .write()
        .map_err(|_| napi_error("managed token provider cache lock poisoned"))?;
      let mut config_guard = self
        .config
        .write()
        .map_err(|_| napi_error("BackendRuntime config lock poisoned"))?;
      let mut object_storage_guard = self
        .object_storage
        .write()
        .map_err(|_| napi_error("object storage service lock poisoned"))?;
      token_providers.clear();
      *config_guard = Arc::new(config);
      *object_storage_guard = object_storage;
      *search_guard = search;
      if let Some(service) = blob_access.as_ref() {
        service.start_stream_cleanup();
      }
      *blob_access_guard = blob_access;
      (
        std::mem::replace(&mut *quota_cache_guard, quota_read_cache),
        std::mem::replace(&mut *payment_guard, payment),
      )
    };
    let active_invalidation = if !self.script_mode {
      let mut targets: Vec<Arc<dyn invalidation::InvalidationTarget>> = Vec::with_capacity(3);
      if let Some(service) = invalidation_blob_access {
        targets.push(service);
      }
      if let Some(cache) = invalidation_quota_cache {
        targets.push(cache);
      }
      targets.push(Arc::new(invalidation::EventInvalidationTarget(
        self.invalidation_events.clone(),
      )));
      let target = Arc::new(invalidation::CompositeInvalidationTarget(targets));
      Some(invalidation::InvalidationRuntime::start(&redis_config, self.role.owns_read_cache(), target).await)
    } else {
      None
    };
    let previous_invalidation = std::mem::replace(&mut *self.invalidation.lock().await, active_invalidation.clone());
    if payment_worker_enabled(self.role)
      && let (Some(payment), Some(invalidation)) = (active_payment, active_invalidation)
    {
      payment.start_worker(invalidation).await;
    }
    if let Some(cache) = previous_cache {
      cache.flush_metrics().await;
    }
    if let Some(invalidation) = previous_invalidation {
      invalidation.stop().await;
    }
    if let Some(payment) = previous_payment {
      payment.stop().await;
    }
    self.sync_license_health_worker().await.map_err(to_napi_error)?;
    Ok(())
  }

  async fn sync_license_health_worker(&self) -> RuntimeResult<()> {
    let enabled = !self.script_mode
      && self.role.owns_background()
      && self.config()?.deployment == crate::runtime::Deployment::SelfHosted;
    let mut worker = self.license_health_worker.lock().await;
    if enabled && worker.is_none() {
      *worker = Some(super::entitlement::LicenseHealthWorker::start(self.clone()));
    } else if !enabled && let Some(active) = worker.take() {
      active.stop().await;
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
    let embedding = self
      .embedding_health
      .read()
      .map_err(|_| napi_error("embedding health lock poisoned"))?
      .clone();
    let invalidation = self
      .invalidation
      .lock()
      .await
      .as_ref()
      .map(|runtime| runtime.health())
      .unwrap_or_else(|| crate::runtime::types::InvalidationHealth {
        state: "disabled".to_string(),
        reconnects: 0,
        decode_failures: 0,
        received: 0,
        published: 0,
        publish_failures: 0,
      });

    Ok(BackendRuntimeHealth {
      started: pool.is_some(),
      database_connected,
      embedding,
      invalidation,
    })
  }
}

fn payment_worker_enabled(role: super::ServerRole) -> bool {
  role.owns_background()
    && (std::env::var("NODE_ENV").as_deref() != Ok("test")
      || std::env::var("AFFINE_PAYMENT_WORKER").as_deref() == Ok("1"))
}
