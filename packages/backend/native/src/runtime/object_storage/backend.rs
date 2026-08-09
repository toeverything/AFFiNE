use std::{collections::HashMap, fs};

use serde::Deserialize;
use serde_json::{Map, Value};
use sqlx::{PgPool, Row};

use super::{config::ObjectStorageConfig, types::StorageProviderConfig};
use crate::runtime::{ConfigSource, RuntimeError, RuntimeResult};

#[derive(Clone, Debug)]
pub(in crate::runtime) enum StorageBackendConfig {
  Fs(FsStorageConfig),
  S3(ObjectStorageConfig),
  Assetpack(FsStorageConfig),
}

#[derive(Clone, Debug)]
pub(in crate::runtime) struct FsStorageConfig {
  pub(in crate::runtime) provider: String,
  pub(in crate::runtime) root: String,
  pub(in crate::runtime) bucket: String,
}

#[derive(Debug, Default, Deserialize)]
struct ObjectStorageAppConfig {
  #[serde(default)]
  storages: Option<HashMap<String, Value>>,
  copilot: Option<CopilotConfigFile>,
}

#[derive(Debug, Deserialize)]
struct FsConfigFile {
  path: String,
}

#[derive(Debug, Default, Deserialize)]
struct CopilotConfigFile {
  storage: Option<StorageProviderConfig>,
}

impl StorageBackendConfig {
  fn from_provider_config(storage: Option<StorageProviderConfig>) -> RuntimeResult<Option<Self>> {
    let Some(storage) = storage else {
      return Ok(None);
    };

    match storage.provider.as_str() {
      "fs" | "assetpack" => {
        let config: FsConfigFile = serde_json::from_value(storage.config)
          .map_err(|err| RuntimeError::json("invalid file storage config", err))?;
        let config = FsStorageConfig {
          provider: storage.provider.clone(),
          root: config.path,
          bucket: storage.bucket,
        };
        Ok(Some(if storage.provider == "fs" {
          Self::Fs(config)
        } else {
          Self::Assetpack(config)
        }))
      }
      "aws-s3" | "cloudflare-r2" => ObjectStorageConfig::from_provider_config(Some(storage))
        .map(|config| config.map(Self::S3))
        .map_err(Into::into),
      provider => Err(RuntimeError::config(format!(
        "unsupported object storage provider: {provider}"
      ))),
    }
  }

  pub(in crate::runtime) fn provider(&self) -> &str {
    match self {
      Self::Fs(config) | Self::Assetpack(config) => &config.provider,
      Self::S3(config) => &config.provider,
    }
  }

  pub(in crate::runtime) fn bucket(&self) -> &str {
    match self {
      Self::Fs(config) | Self::Assetpack(config) => &config.bucket,
      Self::S3(config) => &config.bucket,
    }
  }
}

impl ObjectStorageAppConfig {
  fn storage_backends(&self) -> RuntimeResult<HashMap<String, StorageBackendConfig>> {
    let mut backends = HashMap::new();
    for (scope, key) in [("blob", "blob.storage"), ("avatar", "avatar.storage")] {
      if let Some(storage) = self.storage_provider_config(key)?
        && let Some(backend) = StorageBackendConfig::from_provider_config(Some(storage))?
      {
        backends.insert(scope.to_string(), backend);
      }
    }
    if let Some(storage) = self.copilot.as_ref().and_then(|copilot| copilot.storage.clone())
      && let Some(backend) = StorageBackendConfig::from_provider_config(Some(storage))?
    {
      backends.insert("copilot".to_string(), backend);
    }
    Ok(backends)
  }

  fn storage_provider_config(&self, key: &str) -> RuntimeResult<Option<StorageProviderConfig>> {
    self
      .storages
      .as_ref()
      .and_then(|storages| storages.get(key).cloned())
      .map(serde_json::from_value)
      .transpose()
      .map_err(|err| RuntimeError::json("invalid storage provider config", err))
  }

  fn merge(&mut self, config: Self) {
    if let Some(storages) = config.storages
      && !storages.is_empty()
    {
      self.storages.get_or_insert_with(HashMap::new).extend(storages);
    }
    if let Some(storage) = config.copilot.and_then(|copilot| copilot.storage) {
      self.copilot.get_or_insert_default().storage = Some(storage);
    }
  }
}

fn default_object_storage_config() -> ObjectStorageAppConfig {
  let storage = |bucket: &str| {
    serde_json::json!({
      "provider": "fs",
      "bucket": bucket,
      "config": { "path": "~/.affine/storage" }
    })
  };

  ObjectStorageAppConfig {
    storages: Some(HashMap::from([
      ("blob.storage".to_string(), storage("blobs")),
      ("avatar.storage".to_string(), storage("avatars")),
    ])),
    copilot: Some(CopilotConfigFile {
      storage: Some(StorageProviderConfig {
        provider: "fs".to_string(),
        bucket: "copilot".to_string(),
        config: serde_json::json!({ "path": "~/.affine/storage" }),
      }),
    }),
  }
}

pub(super) fn backends_from_config_files() -> RuntimeResult<HashMap<String, StorageBackendConfig>> {
  backends_from_config_source(&ConfigSource::default())
}

pub(super) fn backends_from_config_source(
  source: &ConfigSource,
) -> RuntimeResult<HashMap<String, StorageBackendConfig>> {
  let mut merged = default_object_storage_config();
  for path in source.paths() {
    if !path.exists() {
      if source.required(&path) {
        return Err(RuntimeError::config(format!(
          "config file does not exist: {}",
          path.display()
        )));
      }
      continue;
    }
    let raw = fs::read_to_string(&path).map_err(|err| RuntimeError::io("failed to read config file", err))?;
    let config = serde_json::from_str(&raw).map_err(|err| RuntimeError::json("failed to parse config file", err))?;
    merged.merge(config);
  }
  merged.storage_backends()
}

pub(super) fn backends_from_config_json(config_json: &str) -> RuntimeResult<HashMap<String, StorageBackendConfig>> {
  let config = serde_json::from_str::<ObjectStorageAppConfig>(config_json)
    .map_err(|err| RuntimeError::json("invalid object storage config", err))?;
  let mut merged = default_object_storage_config();
  merged.merge(config);
  merged.storage_backends()
}

pub(super) async fn backends_from_db(pool: &PgPool) -> RuntimeResult<HashMap<String, StorageBackendConfig>> {
  let rows = match sqlx::query("SELECT id, value FROM app_configs").fetch_all(pool).await {
    Ok(rows) => rows,
    Err(sqlx::Error::Database(err)) if err.code().as_deref() == Some("42P01") => return Ok(HashMap::new()),
    Err(err) => return Err(RuntimeError::database("failed to load app config overrides", err)),
  };
  let mut root = Map::new();
  for row in rows {
    let path: String = row.get("id");
    let value: Value = row.get("value");
    let Some((module, key)) = path.split_once('.') else {
      continue;
    };
    let module = root
      .entry(module.to_string())
      .or_insert_with(|| Value::Object(Map::new()));
    if let Value::Object(module) = module {
      module.insert(key.to_string(), value);
    }
  }
  serde_json::from_value::<ObjectStorageAppConfig>(Value::Object(root))
    .map_err(|err| RuntimeError::json("invalid app config overrides", err))?
    .storage_backends()
}
