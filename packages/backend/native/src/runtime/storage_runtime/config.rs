use std::{env, fs};

use serde::Deserialize;
use sqlx::PgPool;

use super::{ObjectStorageService, RuntimeError, RuntimeResult};

#[derive(Clone, Debug)]
pub(super) struct StorageRuntimeConfig {
  pub(super) database_url: String,
  pub(super) object_storage: ObjectStorageService,
}

#[derive(Debug, Default, Deserialize)]
struct StorageRuntimeAppConfig {
  db: Option<DbConfigFile>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbConfigFile {
  datasource_url: Option<String>,
}

impl StorageRuntimeConfig {
  pub(super) fn from_config_files() -> RuntimeResult<Self> {
    let app_config = storage_runtime_config_from_files()?;
    let database_url = database_url_from_env()
      .or(app_config.database_url())
      .unwrap_or_else(|| "postgresql://localhost:5432/affine".to_string());
    Ok(Self {
      database_url,
      object_storage: ObjectStorageService::from_config_files()?,
    })
  }

  pub(super) fn from_config_json(config_json: &str) -> RuntimeResult<Self> {
    let app_config: StorageRuntimeAppConfig =
      serde_json::from_str(config_json).map_err(|err| RuntimeError::json("invalid storage runtime config", err))?;
    let database_url = database_url_from_env()
      .or(app_config.database_url())
      .unwrap_or_else(|| "postgresql://localhost:5432/affine".to_string());
    Ok(Self {
      database_url,
      object_storage: ObjectStorageService::from_config_json(config_json)?,
    })
  }

  pub(super) async fn with_db_overrides(&self, pool: &PgPool) -> RuntimeResult<Self> {
    Ok(Self {
      database_url: self.database_url.clone(),
      object_storage: self.object_storage.with_db_overrides(pool).await?,
    })
  }
}
impl StorageRuntimeAppConfig {
  fn database_url(&self) -> Option<String> {
    self
      .db
      .as_ref()
      .and_then(|db| db.datasource_url.clone())
      .and_then(non_empty_string)
  }

  fn merge(&mut self, config: Self) {
    if config.db.is_some() {
      self.db = config.db;
    }
  }
}

fn database_url_from_env() -> Option<String> {
  env::var("DATABASE_URL").ok().and_then(non_empty_string)
}

fn non_empty_string(value: String) -> Option<String> {
  if value.trim().is_empty() { None } else { Some(value) }
}

fn storage_runtime_config_from_files() -> RuntimeResult<StorageRuntimeAppConfig> {
  let mut merged = StorageRuntimeAppConfig::default();
  for path in crate::runtime::config::config_json_paths() {
    if !path.exists() {
      continue;
    }
    let raw = fs::read_to_string(&path).map_err(|err| RuntimeError::io("failed to read config file", err))?;
    let config = serde_json::from_str(&raw).map_err(|err| RuntimeError::json("failed to parse config file", err))?;
    merged.merge(config);
  }
  Ok(merged)
}
