use std::env;

use serde::Deserialize;
use sqlx::PgPool;

use super::{ObjectStorageService, RuntimeError, RuntimeResult};
use crate::runtime::config::ServerConfig;

#[derive(Clone, Debug)]
pub(in crate::runtime) struct StorageRuntimeConfig {
  pub(in crate::runtime) database_url: String,
  pub(in crate::runtime) object_storage: ObjectStorageService,
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
  pub(in crate::runtime) fn from_server_config(config: &ServerConfig) -> RuntimeResult<Self> {
    let app_config: StorageRuntimeAppConfig = serde_json::from_value(config.baseline().clone())
      .map_err(|err| RuntimeError::json("invalid storage runtime config", err))?;
    let database_url = database_url_from_env()
      .or(app_config.database_url())
      .unwrap_or_else(|| "postgresql://localhost:5432/affine".to_string());
    Ok(Self {
      database_url,
      object_storage: config.object_storage().clone(),
    })
  }

  #[cfg(test)]
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
}

fn database_url_from_env() -> Option<String> {
  env::var("DATABASE_URL").ok().and_then(non_empty_string)
}

fn non_empty_string(value: String) -> Option<String> {
  if value.trim().is_empty() { None } else { Some(value) }
}
