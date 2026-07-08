mod constants;
mod coordination_lease;
mod doc_compactor;
mod doc_storage;
mod gate;
mod housekeeping;
mod rolling_quota;
mod runtime_state;
#[cfg(test)]
mod tests;
mod workspace_stats;
use std::{sync::RwLock, time::Duration};

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

pub(super) fn token_hash(token: &str) -> String {
  hex::encode(Sha256::digest(token.as_bytes()))
}

#[napi_derive::napi]
pub struct BackendRuntime {
  config: RwLock<BackendRuntimeConfig>,
  pool: Mutex<Option<PgPool>>,
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi(constructor)]
  pub fn new() -> Result<Self> {
    Ok(Self {
      config: RwLock::new(BackendRuntimeConfig::from_config_files().map_err(to_napi_error)?),
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

    let database_url = self.config()?.database_url;
    let pool = PgPoolOptions::new()
      .max_connections(5)
      .acquire_timeout(Duration::from_secs(5))
      .connect(&database_url)
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

  pub(crate) async fn pool(&self) -> RuntimeResult<PgPool> {
    self
      .pool
      .lock()
      .await
      .as_ref()
      .cloned()
      .ok_or_else(|| RuntimeError::invalid_state("BackendRuntime must be started before using postgres operations"))
  }

  pub(crate) fn config(&self) -> RuntimeResult<BackendRuntimeConfig> {
    self
      .config
      .read()
      .map(|config| config.clone())
      .map_err(|_| RuntimeError::invalid_state("BackendRuntime config lock poisoned"))
  }

  fn update_config(&self, config: BackendRuntimeConfig) -> RuntimeResult<()> {
    *self
      .config
      .write()
      .map_err(|_| RuntimeError::invalid_state("BackendRuntime config lock poisoned"))? = config;
    Ok(())
  }
}
