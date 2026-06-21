use std::{
  collections::HashMap,
  env, fs,
  path::{Path, PathBuf},
};

use napi::Result;
use serde::Deserialize;

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
    let database_url =
      database_url_from_config_files()?.unwrap_or_else(|| "postgresql://localhost:5432/affine".to_string());
    let storage = ObjectStorageConfig::from_config_files()?;
    Ok(Self { database_url, storage })
  }
}

#[derive(Debug, Deserialize)]
struct AppConfigFile {
  db: Option<DbConfigFile>,
  storages: Option<HashMap<String, StorageProviderConfig>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbConfigFile {
  datasource_url: Option<String>,
}

fn database_url_from_config_files() -> Result<Option<String>> {
  let mut database_url = None;
  for path in config_json_paths() {
    if !path.exists() {
      continue;
    }
    let raw = fs::read_to_string(&path)
      .map_err(|err| napi_error(format!("failed to read config file {}: {err}", path.display())))?;
    let config: AppConfigFile = serde_json::from_str(&raw)
      .map_err(|err| napi_error(format!("failed to parse config file {}: {err}", path.display())))?;
    if let Some(next) = config.db.and_then(|db| db.datasource_url)
      && !next.trim().is_empty()
    {
      database_url = Some(next);
    }
  }

  Ok(database_url)
}

pub(super) fn blob_storage_config_from_config_files() -> Result<Option<StorageProviderConfig>> {
  let mut storage = None;
  for path in config_json_paths() {
    if !path.exists() {
      continue;
    }
    let raw = fs::read_to_string(&path)
      .map_err(|err| napi_error(format!("failed to read config file {}: {err}", path.display())))?;
    let config: AppConfigFile = serde_json::from_str(&raw)
      .map_err(|err| napi_error(format!("failed to parse config file {}: {err}", path.display())))?;
    if let Some(next) = config.storages.and_then(|mut storages| storages.remove("blob.storage")) {
      storage = Some(next);
    }
  }

  Ok(storage)
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
}
