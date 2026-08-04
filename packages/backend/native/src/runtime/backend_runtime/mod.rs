mod byok;
mod constants;
mod coordination_lease;
mod copilot;
mod doc_compactor;
mod doc_storage;
mod gate;
mod housekeeping;
mod rolling_quota;
mod runtime_state;
#[cfg(test)]
mod tests;
mod workspace_stats;
use std::{
  sync::{Arc, RwLock},
  time::Duration,
};

use byok::LocalLeasePayload;
use copilot::{backend_provider, byok_endpoint, executable_protocol};
use napi::Result;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use tokio::sync::Mutex;

use self::types::BackendRuntimeHealth;
pub(crate) use super::types;
pub(super) use super::{
  BackendRuntimeConfig, InviteQuotaConfig, RuntimeError, RuntimeResult, migrations::migrate_runtime_tables, napi_error,
  to_napi_error,
};
use crate::llm::{
  ByokLocalLeaseOutput, ByokProbeResultOutput, ByokProfileOutput, CreateByokLocalLeaseInput, CreateByokProfileInput,
  ProbeByokDraftInput, ProbeByokProfileInput, ReorderByokProfilesInput, ReplaceByokProfileInput,
  RotateByokCredentialInput,
};

pub(super) fn token_hash(token: &str) -> String {
  hex::encode(Sha256::digest(token.as_bytes()))
}

#[napi_derive::napi]
pub struct BackendRuntime {
  config: RwLock<Arc<BackendRuntimeConfig>>,
  pool: Mutex<Option<PgPool>>,
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi(constructor)]
  pub fn new(private_key: Option<String>) -> Result<Self> {
    let config = BackendRuntimeConfig::from_config_files(private_key).map_err(to_napi_error)?;
    Ok(Self {
      config: RwLock::new(Arc::new(config)),
      pool: Mutex::new(None),
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

    *guard = Some(pool);
    Ok(())
  }

  #[napi]
  pub async fn stop(&self) -> Result<()> {
    let pool = self.pool.lock().await.take();
    if let Some(pool) = pool {
      pool.close().await;
    }
    Ok(())
  }

  #[napi]
  pub async fn reload_config(&self, private_key: Option<String>) -> Result<()> {
    let pool = self.pool().await.map_err(to_napi_error)?;
    let config = BackendRuntimeConfig::from_config_files(private_key)
      .map_err(to_napi_error)?
      .with_db_overrides(&pool)
      .await
      .map_err(to_napi_error)?;
    self.update_config(config).map_err(to_napi_error)
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
    })
  }

  #[napi]
  pub async fn run_migrations(&self) -> Result<()> {
    let pool = self.pool().await?;
    migrate_runtime_tables(&pool).await.map_err(to_napi_error)
  }

  #[napi]
  pub async fn list_byok_profiles(&self, workspace_id: String) -> Result<Vec<ByokProfileOutput>> {
    byok::list(&self.pool().await?, &workspace_id)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn create_byok_profile(&self, input: CreateByokProfileInput) -> Result<ByokProfileOutput> {
    let config = self.config()?;
    byok::create(
      &self.pool().await?,
      config.private_key.as_bytes(),
      &config.copilot.byok,
      input,
    )
    .await
    .map_err(to_napi_error)
  }

  #[napi]
  pub async fn replace_byok_profile(&self, input: ReplaceByokProfileInput) -> Result<ByokProfileOutput> {
    let config = self.config()?;
    byok::replace(
      &self.pool().await?,
      config.private_key.as_bytes(),
      &config.copilot.byok,
      input,
    )
    .await
    .map_err(to_napi_error)
  }

  #[napi]
  pub async fn rotate_byok_credential(&self, input: RotateByokCredentialInput) -> Result<ByokProfileOutput> {
    let config = self.config()?;
    byok::rotate(&self.pool().await?, config.private_key.as_bytes(), input)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn probe_byok_profile(&self, input: ProbeByokProfileInput) -> Result<ByokProbeResultOutput> {
    let config = self.config()?;
    byok::probe_profile(
      &self.pool().await?,
      config.private_key.as_bytes(),
      &config.copilot.byok,
      input,
    )
    .await
    .map_err(to_napi_error)
  }

  #[napi]
  pub async fn probe_byok_draft(&self, input: ProbeByokDraftInput) -> Result<ByokProbeResultOutput> {
    let config = self.config()?;
    byok::probe_draft(
      &self.pool().await?,
      config.private_key.as_bytes(),
      &config.copilot.byok,
      input,
    )
    .await
    .map_err(to_napi_error)
  }

  #[napi]
  pub async fn delete_byok_profile(&self, workspace_id: String, profile_id: String) -> Result<bool> {
    byok::delete(&self.pool().await?, &workspace_id, &profile_id)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn reorder_byok_profiles(&self, input: ReorderByokProfilesInput) -> Result<Vec<ByokProfileOutput>> {
    byok::reorder(&self.pool().await?, input).await.map_err(to_napi_error)
  }

  #[napi]
  pub async fn create_byok_local_lease(&self, input: CreateByokLocalLeaseInput) -> Result<ByokLocalLeaseOutput> {
    let config = self.config()?;
    byok::create_local_lease(
      &self.pool().await?,
      config.private_key.as_bytes(),
      &config.copilot.byok,
      input,
    )
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

  pub(crate) fn config(&self) -> RuntimeResult<Arc<BackendRuntimeConfig>> {
    self
      .config
      .read()
      .map(|config| Arc::clone(&config))
      .map_err(|_| RuntimeError::invalid_state("BackendRuntime config lock poisoned"))
  }

  fn update_config(&self, config: BackendRuntimeConfig) -> RuntimeResult<()> {
    *self
      .config
      .write()
      .map_err(|_| RuntimeError::invalid_state("BackendRuntime config lock poisoned"))? = Arc::new(config);
    Ok(())
  }
}
