use std::{
  collections::HashMap,
  env, fs,
  path::{Path, PathBuf},
};

use napi::Result;
use serde::Deserialize;
use serde_json::Map;
use sqlx::{PgPool, Row};

use super::{
  error::napi_error,
  object_storage::{ObjectStorageConfig, StorageProviderConfig},
};

#[derive(Clone, Debug)]
pub(super) struct RuntimeConfig {
  pub(super) database_url: String,
  pub(super) storage: Option<ObjectStorageConfig>,
}

impl RuntimeConfig {
  pub(super) fn from_config_files() -> Result<Self> {
    let app_config = app_config_from_config_files()?;
    let database_url = database_url_from_env()
      .or(app_config.database_url())
      .unwrap_or_else(|| "postgresql://localhost:5432/affine".to_string());
    let storage = ObjectStorageConfig::from_provider_config(app_config.blob_storage_provider_config())?;
    Ok(Self { database_url, storage })
  }

  pub(super) async fn with_db_overrides(&self, pool: &PgPool) -> Result<Self> {
    let mut app_config = app_config_from_config_files()?;
    app_config.apply_file_config(load_app_config_overrides_from_db(pool).await?);
    Ok(Self {
      // The DB override is loaded after this connection already exists, so it
      // must not rewrite the active datasource URL.
      database_url: self.database_url.clone(),
      storage: ObjectStorageConfig::from_provider_config(app_config.blob_storage_provider_config())?,
    })
  }
}

#[derive(Debug, Default, Deserialize)]
struct AppConfigFile {
  db: Option<DbConfigFile>,
  #[serde(default)]
  storages: Option<HashMap<String, StorageProviderConfig>>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbConfigFile {
  datasource_url: Option<String>,
}

impl AppConfigFile {
  fn database_url(&self) -> Option<String> {
    self
      .db
      .as_ref()
      .and_then(|db| db.datasource_url.clone())
      .and_then(non_empty_string)
  }

  fn blob_storage_provider_config(&self) -> Option<StorageProviderConfig> {
    self
      .storages
      .as_ref()
      .and_then(|storages| storages.get("blob.storage").cloned())
  }
}

fn database_url_from_env() -> Option<String> {
  env::var("DATABASE_URL").ok().and_then(non_empty_string)
}

fn non_empty_string(value: String) -> Option<String> {
  if value.trim().is_empty() { None } else { Some(value) }
}

fn app_config_from_config_files() -> Result<AppConfigFile> {
  let mut merged = AppConfigFile::default();
  for path in config_json_paths() {
    if !path.exists() {
      continue;
    }
    let raw = fs::read_to_string(&path)
      .map_err(|err| napi_error(format!("failed to read config file {}: {err}", path.display())))?;
    let config: AppConfigFile = serde_json::from_str(&raw)
      .map_err(|err| napi_error(format!("failed to parse config file {}: {err}", path.display())))?;
    merged.apply_file_config(config);
  }

  Ok(merged)
}

impl AppConfigFile {
  fn apply_file_config(&mut self, config: AppConfigFile) {
    if config.db.is_some() {
      self.db = config.db;
    }
    if let Some(storages) = config.storages
      && !storages.is_empty()
    {
      self.storages.get_or_insert_with(HashMap::new).extend(storages);
    }
  }
}

async fn load_app_config_overrides_from_db(pool: &PgPool) -> Result<AppConfigFile> {
  let rows = match sqlx::query("SELECT id, value FROM app_configs").fetch_all(pool).await {
    Ok(rows) => rows,
    Err(sqlx::Error::Database(err)) if err.code().as_deref() == Some("42P01") => return Ok(AppConfigFile::default()),
    Err(err) => return Err(napi_error(format!("failed to load app config overrides: {err}"))),
  };

  app_config_from_flat_overrides(rows.into_iter().map(|row| {
    let id: String = row.get("id");
    let value: serde_json::Value = row.get("value");
    (id, value)
  }))
}

fn app_config_from_flat_overrides<I, S>(rows: I) -> Result<AppConfigFile>
where
  I: IntoIterator<Item = (S, serde_json::Value)>,
  S: AsRef<str>,
{
  let mut root = Map::new();
  for (path, value) in rows {
    let Some((module, key)) = path.as_ref().split_once('.') else {
      continue;
    };
    root
      .entry(module.to_string())
      .or_insert_with(|| serde_json::Value::Object(Map::new()));
    if let Some(serde_json::Value::Object(module_object)) = root.get_mut(module) {
      module_object.insert(key.to_string(), value);
    }
  }

  serde_json::from_value(serde_json::Value::Object(root))
    .map_err(|err| napi_error(format!("invalid app config overrides: {err}")))
}

pub(super) fn config_json_paths() -> Vec<PathBuf> {
  let mut paths = Vec::new();
  if let Ok(exe) = env::current_exe()
    && let Some(dir) = exe.parent()
  {
    paths.push(config_in(dir));
  }
  if let Ok(cwd) = env::current_dir() {
    paths.push(config_in(&cwd));
  }
  dedupe_paths(paths)
}

fn config_in(dir: &Path) -> PathBuf {
  dir.join("config.json")
}

fn dedupe_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
  let mut deduped = Vec::new();
  for path in paths {
    if !deduped.contains(&path) {
      deduped.push(path);
    }
  }
  deduped
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn config_paths_are_limited_to_executable_dir_and_cwd() {
    let paths = config_json_paths();
    assert!(!paths.is_empty());
    assert!(paths.len() <= 2);
    assert!(
      paths
        .iter()
        .all(|path| path.file_name().is_some_and(|name| name == "config.json"))
    );
    assert!(paths.iter().all(|path| !path.to_string_lossy().contains(".affine")));
    assert!(
      paths
        .iter()
        .all(|path| !path.to_string_lossy().contains("packages/backend/server"))
    );
  }

  #[test]
  fn blank_database_urls_are_ignored() {
    assert_eq!(non_empty_string("".to_string()), None);
    assert_eq!(non_empty_string("   ".to_string()), None);
    assert_eq!(
      non_empty_string("postgresql://affine:affine@localhost:5432/affine".to_string()),
      Some("postgresql://affine:affine@localhost:5432/affine".to_string())
    );
  }

  #[test]
  fn parses_blob_storage_app_config_value() {
    let app_config = app_config_from_flat_overrides([
      (
        "unknown.future.config",
        serde_json::json!({
          "shape": "ignored"
        }),
      ),
      (
        "storages.blob.storage",
        serde_json::json!({
          "provider": "cloudflare-r2",
          "bucket": "workspace-blobs-canary",
          "config": {
            "accountId": "account",
            "credentials": {
              "accessKeyId": "key",
              "secretAccessKey": "secret"
            },
            "usePresignedURL": {
              "enabled": true
            }
          }
        }),
      ),
    ])
    .unwrap();
    let storage = app_config.blob_storage_provider_config().unwrap();
    let config = ObjectStorageConfig::from_provider_config(Some(storage))
      .unwrap()
      .unwrap();

    let health = config.health();
    assert!(health.configured);
    assert_eq!(health.provider.as_deref(), Some("cloudflare-r2"));
    assert_eq!(health.bucket.as_deref(), Some("workspace-blobs-canary"));
    assert_eq!(
      health.endpoint.as_deref(),
      Some("https://account.r2.cloudflarestorage.com")
    );
    assert!(health.use_presigned_url);
  }
}
