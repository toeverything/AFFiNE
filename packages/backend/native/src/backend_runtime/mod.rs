mod blob_complete;
mod blob_reclaimer;
mod config;
mod constants;
mod coordination_lease;
mod doc_compactor;
mod doc_storage;
mod error;
mod gate;
mod housekeeping;
mod object_storage;
mod runtime_state;
#[cfg(test)]
mod tests;
mod types;
mod workspace_stats;

use std::time::Duration;

use napi::Result;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use tokio::sync::Mutex;

use self::{config::RuntimeConfig, constants::RUNTIME_MIGRATIONS, error::napi_error, types::BackendRuntimeHealth};

pub(super) fn token_hash(token: &str) -> String {
  hex::encode(Sha256::digest(token.as_bytes()))
}

#[napi_derive::napi]
pub struct BackendRuntime {
  config: RuntimeConfig,
  pool: Mutex<Option<PgPool>>,
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi(constructor)]
  pub fn new() -> Result<Self> {
    Ok(Self {
      config: RuntimeConfig::from_config_files()?,
      pool: Mutex::new(None),
    })
  }

  #[napi]
  pub async fn start(&self) -> Result<()> {
    let mut guard = self.pool.lock().await;
    if guard.is_some() {
      return Ok(());
    }

    let pool = PgPoolOptions::new()
      .max_connections(5)
      .acquire_timeout(Duration::from_secs(5))
      .connect(&self.config.database_url)
      .await
      .map_err(|err| napi_error(format!("BackendRuntime failed to connect postgres: {err}")))?;

    sqlx::query("SELECT 1")
      .execute(&pool)
      .await
      .map_err(|err| napi_error(format!("BackendRuntime postgres health check failed: {err}")))?;

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
      object_storage_configured: self.config.storage.is_some(),
    })
  }

  #[napi]
  pub async fn run_migrations(&self) -> Result<()> {
    let pool = self.pool().await?;
    migrate_runtime_tables(&pool).await
  }

  async fn pool(&self) -> Result<PgPool> {
    self
      .pool
      .lock()
      .await
      .as_ref()
      .cloned()
      .ok_or_else(|| napi_error("BackendRuntime must be started before using postgres operations"))
  }
}

async fn migrate_runtime_tables(pool: &PgPool) -> Result<()> {
  for statement in RUNTIME_MIGRATIONS
    .split(';')
    .map(str::trim)
    .filter(|statement| !statement.is_empty())
  {
    sqlx::query(statement)
      .execute(pool)
      .await
      .map_err(|err| napi_error(format!("BackendRuntime migration failed: {err}")))?;
  }

  Ok(())
}
