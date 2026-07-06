use std::{
  collections::HashMap,
  env, fs,
  path::{Path, PathBuf},
  sync::RwLock,
  time::SystemTime,
};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use napi::bindgen_prelude::Buffer;
use serde::Deserialize;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use tokio::{sync::Mutex, task::JoinSet};

mod assetpack;
mod blob_cleanup;
mod blob_reclaimer;
mod blob_reconciliation;
mod doc_blob_refs;
pub(crate) mod object_storage;

use self::object_storage::{
  ObjectStorageConfig, StorageProviderConfig,
  types::{
    ObjectDeleteOutcome, ObjectGetResult, ObjectListEntry, ObjectMetadata, ObjectPutMetadata, checksum_crc32_base64,
  },
};
pub(super) use super::{
  RuntimeError, RuntimeResult,
  migrations::migrate_runtime_tables,
  napi_error, to_napi_error,
  types::{
    RuntimeBlobCleanupExecuteResult, RuntimeBlobCleanupPlanResult, RuntimeBlobCleanupResult, RuntimeBlobCompleteResult,
    RuntimeBlobMetadataBackfillResult, RuntimeDocBlobRefsResult, RuntimeMultipartUploadInit,
    RuntimeMultipartUploadPart, RuntimeObjectGetResult, RuntimeObjectListEntry, RuntimeObjectMetadata,
    RuntimeObjectStoragePutOptions, RuntimePresignedObjectRequest,
  },
};

const MAX_BLOB_SIZE: i64 = i32::MAX as i64;
const OBJECT_DELETE_MANY_CHUNK_SIZE: usize = 500;
const OBJECT_DELETE_MANY_CONCURRENCY: usize = 3;

type Result<T> = RuntimeResult<T>;

#[napi_derive::napi(object)]
pub struct StorageRuntimeHealth {
  pub started: bool,
  pub database_connected: bool,
  pub provider_configured: bool,
  pub provider: Option<String>,
  pub bucket: Option<String>,
}

#[napi_derive::napi(object)]
pub struct StorageProviderCapabilities {
  pub put: bool,
  pub get: bool,
  pub head: bool,
  pub list: bool,
  pub delete: bool,
  pub presign_put: bool,
  pub presign_get: bool,
  pub multipart_direct: bool,
  pub proxy_upload: bool,
  pub assetpack: bool,
  pub server_mediated_only: bool,
}

#[derive(Clone, Debug)]
enum StorageBackendConfig {
  Fs(FsStorageConfig),
  S3(ObjectStorageConfig),
  Assetpack(FsStorageConfig),
}

#[derive(Clone, Debug)]
struct FsStorageConfig {
  provider: String,
  root: String,
  bucket: String,
}

#[derive(Clone, Debug)]
struct StorageRuntimeConfig {
  database_url: String,
  backends: HashMap<String, StorageBackendConfig>,
}

#[derive(Debug, Default, Deserialize)]
struct AppConfigFile {
  db: Option<DbConfigFile>,
  #[serde(default)]
  storages: Option<HashMap<String, Value>>,
  copilot: Option<CopilotConfigFile>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbConfigFile {
  datasource_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FsConfigFile {
  path: String,
}

#[derive(Debug, Default, Deserialize)]
struct CopilotConfigFile {
  storage: Option<StorageProviderConfig>,
}

impl StorageRuntimeConfig {
  fn from_config_files() -> RuntimeResult<Self> {
    Self::from_app_config_file(app_config_from_config_files()?)
  }

  fn from_app_config_file(app_config: AppConfigFile) -> RuntimeResult<Self> {
    let database_url = database_url_from_env()
      .or(app_config.database_url())
      .unwrap_or_else(|| "postgresql://localhost:5432/affine".to_string());
    let backends = app_config.storage_backends()?;
    Ok(Self { database_url, backends })
  }

  async fn with_db_overrides(&self, pool: &PgPool) -> RuntimeResult<Self> {
    let app_config = load_app_config_overrides_from_db(pool).await?;
    let mut backends = self.backends.clone();
    backends.extend(app_config.storage_backends()?);
    Ok(Self {
      database_url: self.database_url.clone(),
      backends,
    })
  }
}

impl StorageBackendConfig {
  fn from_provider_config(storage: Option<StorageProviderConfig>) -> RuntimeResult<Option<Self>> {
    let Some(storage) = storage else {
      return Ok(None);
    };

    match storage.provider.as_str() {
      "fs" => {
        let config: FsConfigFile = serde_json::from_value(storage.config)
          .map_err(|err| RuntimeError::json("invalid fs blob storage config", err))?;
        Ok(Some(Self::Fs(FsStorageConfig {
          provider: storage.provider,
          root: config.path,
          bucket: storage.bucket,
        })))
      }
      "assetpack" => {
        let config: FsConfigFile = serde_json::from_value(storage.config)
          .map_err(|err| RuntimeError::json("invalid assetpack blob storage config", err))?;
        Ok(Some(Self::Assetpack(FsStorageConfig {
          provider: storage.provider,
          root: config.path,
          bucket: storage.bucket,
        })))
      }
      "aws-s3" | "cloudflare-r2" => ObjectStorageConfig::from_provider_config(Some(storage))
        .map(|v| v.map(Self::S3))
        .map_err(Into::into),
      provider => Err(RuntimeError::config(format!(
        "unsupported blob storage provider for StorageRuntime: {provider}"
      ))),
    }
  }

  fn provider(&self) -> &str {
    match self {
      Self::Fs(config) | Self::Assetpack(config) => &config.provider,
      Self::S3(config) => &config.provider,
    }
  }

  fn bucket(&self) -> &str {
    match self {
      Self::Fs(config) | Self::Assetpack(config) => &config.bucket,
      Self::S3(config) => &config.bucket,
    }
  }

  fn capabilities(&self) -> StorageProviderCapabilities {
    match self {
      Self::Fs(_) => StorageProviderCapabilities {
        put: true,
        get: true,
        head: true,
        list: true,
        delete: true,
        presign_put: false,
        presign_get: false,
        multipart_direct: false,
        proxy_upload: false,
        assetpack: false,
        server_mediated_only: true,
      },
      Self::S3(config) => {
        let _configured_min_part_size = config.min_part_size;
        StorageProviderCapabilities {
          put: true,
          get: true,
          head: true,
          list: true,
          delete: true,
          presign_put: config.use_presigned_url,
          presign_get: config.use_presigned_url,
          multipart_direct: config.use_presigned_url,
          proxy_upload: config.proxy_upload,
          assetpack: false,
          server_mediated_only: !config.use_presigned_url,
        }
      }
      Self::Assetpack(_) => StorageProviderCapabilities {
        put: true,
        get: true,
        head: true,
        list: true,
        delete: true,
        presign_put: false,
        presign_get: false,
        multipart_direct: false,
        proxy_upload: false,
        assetpack: true,
        server_mediated_only: true,
      },
    }
  }
}

impl AppConfigFile {
  fn database_url(&self) -> Option<String> {
    self
      .db
      .as_ref()
      .and_then(|db| db.datasource_url.clone())
      .and_then(non_empty_string)
  }

  fn storage_backends(&self) -> RuntimeResult<HashMap<String, StorageBackendConfig>> {
    let mut backends = HashMap::new();
    if let Some(storage) = self.storage_provider_config("blob.storage")?
      && let Some(backend) = StorageBackendConfig::from_provider_config(Some(storage))?
    {
      backends.insert("blob".to_string(), backend);
    }
    if let Some(storage) = self.storage_provider_config("avatar.storage")?
      && let Some(backend) = StorageBackendConfig::from_provider_config(Some(storage))?
    {
      backends.insert("avatar".to_string(), backend);
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

  fn apply_file_config(&mut self, config: AppConfigFile) {
    if config.db.is_some() {
      self.db = config.db;
    }
    if let Some(storages) = config.storages
      && !storages.is_empty()
    {
      self.storages.get_or_insert_with(HashMap::new).extend(storages);
    }
    if config.copilot.is_some() {
      self.copilot = config.copilot;
    }
  }
}

#[napi_derive::napi]
pub struct StorageRuntime {
  config: RwLock<StorageRuntimeConfig>,
  pool: Mutex<Option<PgPool>>,
}

#[napi_derive::napi]
impl StorageRuntime {
  #[napi(constructor)]
  pub fn new() -> napi::Result<Self> {
    Ok(Self {
      config: RwLock::new(StorageRuntimeConfig::from_config_files().map_err(to_napi_error)?),
      pool: Mutex::new(None),
    })
  }

  #[napi]
  pub async fn start(&self) -> napi::Result<()> {
    self.start_inner().await.map_err(to_napi_error)
  }

  #[napi]
  pub fn configure(&self, config_json: String) -> napi::Result<()> {
    let app_config: AppConfigFile = serde_json::from_str(&config_json)
      .map_err(|err| to_napi_error(RuntimeError::json("invalid storage runtime config", err)))?;
    let config = StorageRuntimeConfig::from_app_config_file(app_config).map_err(to_napi_error)?;
    self.update_config(config).map_err(to_napi_error)
  }

  async fn start_inner(&self) -> RuntimeResult<()> {
    let mut guard = self.pool.lock().await;
    if guard.is_some() {
      return Ok(());
    }

    let database_url = self.config()?.database_url;
    let pool = PgPoolOptions::new()
      .max_connections(5)
      .acquire_timeout(std::time::Duration::from_secs(5))
      .connect(&database_url)
      .await
      .map_err(|err| RuntimeError::database("StorageRuntime failed to connect postgres", err))?;

    sqlx::query("SELECT 1")
      .execute(&pool)
      .await
      .map_err(|err| RuntimeError::database("StorageRuntime postgres health check failed", err))?;

    let config = self.config()?.with_db_overrides(&pool).await?;
    self.update_config(config)?;
    *guard = Some(pool);
    Ok(())
  }

  #[napi]
  pub async fn stop(&self) -> napi::Result<()> {
    let pool = self.pool.lock().await.take();
    if let Some(pool) = pool {
      pool.close().await;
    }
    Ok(())
  }

  #[napi]
  pub async fn run_migrations(&self) -> napi::Result<()> {
    let pool = self.pool().await?;
    migrate_runtime_tables(&pool).await.map_err(to_napi_error)
  }

  #[napi]
  pub async fn health(&self) -> napi::Result<StorageRuntimeHealth> {
    self.health_inner().await.map_err(to_napi_error)
  }

  async fn health_inner(&self) -> RuntimeResult<StorageRuntimeHealth> {
    let pool = self.pool.lock().await.as_ref().cloned();
    let database_connected = match pool.as_ref() {
      Some(pool) => sqlx::query("SELECT 1")
        .fetch_one(pool)
        .await
        .map(|row| row.try_get::<i32, _>(0).unwrap_or(0) == 1)
        .unwrap_or(false),
      None => false,
    };
    let backend = self.config()?.backends.get("blob").cloned();

    Ok(StorageRuntimeHealth {
      started: pool.is_some(),
      database_connected,
      provider_configured: !self.config()?.backends.is_empty(),
      provider: backend.as_ref().map(|backend| backend.provider().to_string()),
      bucket: backend.as_ref().map(|backend| backend.bucket().to_string()),
    })
  }

  #[napi]
  pub async fn provider_capabilities(&self, scope: String) -> napi::Result<StorageProviderCapabilities> {
    self
      .backend_for_scope(&scope)
      .map(|backend| backend.capabilities())
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn put_object(
    &self,
    _scope: String,
    key: String,
    body: Buffer,
    metadata: Option<RuntimeObjectStoragePutOptions>,
  ) -> napi::Result<RuntimeObjectMetadata> {
    match self.backend_for_scope(&_scope)? {
      StorageBackendConfig::Fs(config) => Ok(
        fs_put(
          &config,
          &key,
          body.to_vec(),
          metadata.map(Into::into).unwrap_or_default(),
        )?
        .into(),
      ),
      StorageBackendConfig::Assetpack(config) => assetpack::put(
        &config,
        &_scope,
        &key,
        body.to_vec(),
        metadata.map(Into::into).unwrap_or_default(),
      )
      .await
      .map(Into::into)
      .map_err(napi::Error::from),
      StorageBackendConfig::S3(config) => config
        .build_client()?
        .put(&key, body.to_vec(), metadata.map(Into::into).unwrap_or_default())
        .await
        .map(Into::into)
        .map_err(napi::Error::from),
    }
  }

  #[napi]
  pub async fn head_object(&self, _scope: String, key: String) -> napi::Result<Option<RuntimeObjectMetadata>> {
    let metadata = match self.backend_for_scope(&_scope)? {
      StorageBackendConfig::Fs(config) => fs_head(&config, &key)?,
      StorageBackendConfig::Assetpack(config) => assetpack::head(&config, &_scope, &key).await?,
      StorageBackendConfig::S3(config) => config.build_client()?.head(&key).await?,
    };
    Ok(metadata.map(Into::into))
  }

  #[napi]
  pub async fn get_object(&self, _scope: String, key: String) -> napi::Result<Option<RuntimeObjectGetResult>> {
    let object = match self.backend_for_scope(&_scope)? {
      StorageBackendConfig::Fs(config) => fs_get(&config, &key)?,
      StorageBackendConfig::Assetpack(config) => assetpack::get(&config, &_scope, &key).await?,
      StorageBackendConfig::S3(config) => config.build_client()?.get(&key).await?,
    };
    Ok(object.map(Into::into))
  }

  #[napi]
  pub async fn list_objects(
    &self,
    _scope: String,
    prefix: Option<String>,
  ) -> napi::Result<Vec<RuntimeObjectListEntry>> {
    let entries = match self.backend_for_scope(&_scope)? {
      StorageBackendConfig::Fs(config) => fs_list(&config, prefix)?,
      StorageBackendConfig::Assetpack(config) => assetpack::list(&config, &_scope, prefix).await?,
      StorageBackendConfig::S3(config) => config.build_client()?.list(prefix).await?,
    };
    Ok(entries.into_iter().map(Into::into).collect())
  }

  #[napi]
  pub async fn delete_object(&self, _scope: String, key: String) -> napi::Result<()> {
    match self.backend_for_scope(&_scope)? {
      StorageBackendConfig::Fs(config) => Ok(fs_delete(&config, &key)?),
      StorageBackendConfig::Assetpack(config) => assetpack::delete(&config, &_scope, &key)
        .await
        .map_err(napi::Error::from),
      StorageBackendConfig::S3(config) => config.build_client()?.delete(&key).await.map_err(Into::into),
    }
  }

  #[napi]
  pub async fn presign_put(
    &self,
    _scope: String,
    key: String,
    metadata: Option<RuntimeObjectStoragePutOptions>,
  ) -> napi::Result<Option<RuntimePresignedObjectRequest>> {
    match self.backend_for_scope(&_scope)? {
      StorageBackendConfig::Fs(_) | StorageBackendConfig::Assetpack(_) => Ok(None),
      StorageBackendConfig::S3(config) => Ok(Some(
        config
          .build_client()?
          .presign_put(&key, metadata.map(Into::into).unwrap_or_default())
          .await
          .map_err(napi::Error::from)?
          .try_into()?,
      )),
    }
  }

  #[napi]
  pub async fn presign_get(&self, _scope: String, key: String) -> napi::Result<Option<RuntimePresignedObjectRequest>> {
    match self.backend_for_scope(&_scope)? {
      StorageBackendConfig::Fs(_) | StorageBackendConfig::Assetpack(_) => Ok(None),
      StorageBackendConfig::S3(config) => Ok(Some(
        config
          .build_client()?
          .presign_get(&key)
          .await
          .map_err(napi::Error::from)?
          .try_into()?,
      )),
    }
  }

  #[napi]
  pub async fn create_multipart_upload(
    &self,
    _scope: String,
    key: String,
    metadata: Option<RuntimeObjectStoragePutOptions>,
  ) -> napi::Result<Option<RuntimeMultipartUploadInit>> {
    match self.backend_for_scope(&_scope)? {
      StorageBackendConfig::Fs(_) | StorageBackendConfig::Assetpack(_) => Ok(None),
      StorageBackendConfig::S3(config) => Ok(
        config
          .build_client()?
          .create_multipart_upload(&key, metadata.map(Into::into).unwrap_or_default())
          .await
          .map_err(napi::Error::from)?
          .map(Into::into),
      ),
    }
  }

  #[napi]
  pub async fn presign_upload_part(
    &self,
    _scope: String,
    key: String,
    upload_id: String,
    part_number: i32,
  ) -> napi::Result<Option<RuntimePresignedObjectRequest>> {
    match self.backend_for_scope(&_scope)? {
      StorageBackendConfig::Fs(_) | StorageBackendConfig::Assetpack(_) => Ok(None),
      StorageBackendConfig::S3(config) => Ok(Some(
        config
          .build_client()?
          .presign_upload_part(&key, &upload_id, part_number)
          .await
          .map_err(napi::Error::from)?
          .try_into()?,
      )),
    }
  }

  #[napi]
  pub async fn proxy_upload_part(
    &self,
    _scope: String,
    key: String,
    upload_id: String,
    part_number: i32,
    body: Buffer,
    content_length: Option<i64>,
  ) -> napi::Result<Option<String>> {
    match self.backend_for_scope(&_scope)? {
      StorageBackendConfig::Fs(_) | StorageBackendConfig::Assetpack(_) => Ok(None),
      StorageBackendConfig::S3(config) => config
        .build_client()?
        .upload_part(&key, &upload_id, part_number, body.to_vec(), content_length)
        .await
        .map_err(napi::Error::from),
    }
  }

  #[napi]
  pub async fn list_multipart_upload_parts(
    &self,
    _scope: String,
    key: String,
    upload_id: String,
  ) -> napi::Result<Option<Vec<RuntimeMultipartUploadPart>>> {
    match self.backend_for_scope(&_scope)? {
      StorageBackendConfig::Fs(_) | StorageBackendConfig::Assetpack(_) => Ok(None),
      StorageBackendConfig::S3(config) => Ok(Some(
        config
          .build_client()?
          .list_multipart_upload_parts(&key, &upload_id)
          .await
          .map_err(napi::Error::from)?
          .into_iter()
          .map(Into::into)
          .collect(),
      )),
    }
  }

  #[napi]
  pub async fn complete_multipart_upload(
    &self,
    _scope: String,
    key: String,
    upload_id: String,
    parts: Vec<RuntimeMultipartUploadPart>,
  ) -> napi::Result<bool> {
    match self.backend_for_scope(&_scope)? {
      StorageBackendConfig::Fs(_) | StorageBackendConfig::Assetpack(_) => Ok(false),
      StorageBackendConfig::S3(config) => {
        config
          .build_client()?
          .complete_multipart_upload(&key, &upload_id, parts.into_iter().map(Into::into).collect())
          .await
          .map_err(napi::Error::from)?;
        Ok(true)
      }
    }
  }

  #[napi]
  pub async fn abort_multipart_upload(&self, _scope: String, key: String, upload_id: String) -> napi::Result<bool> {
    match self.backend_for_scope(&_scope)? {
      StorageBackendConfig::Fs(_) | StorageBackendConfig::Assetpack(_) => Ok(false),
      StorageBackendConfig::S3(config) => {
        config
          .build_client()?
          .abort_multipart_upload(&key, &upload_id)
          .await
          .map_err(napi::Error::from)?;
        Ok(true)
      }
    }
  }

  #[napi]
  pub async fn complete_workspace_blob_upload(
    &self,
    workspace_id: String,
    key: String,
    expected_size: i64,
    expected_mime: String,
  ) -> napi::Result<RuntimeBlobCompleteResult> {
    match self.backend_for_scope("blob").map_err(napi::Error::from)? {
      StorageBackendConfig::Fs(config) => self
        .complete_fs_workspace_blob(config, workspace_id, key, expected_size, expected_mime)
        .await
        .map_err(napi::Error::from),
      StorageBackendConfig::Assetpack(config) => self
        .complete_assetpack_workspace_blob(config, workspace_id, key, expected_size, expected_mime)
        .await
        .map_err(napi::Error::from),
      StorageBackendConfig::S3(_) => self
        .complete_s3_workspace_blob(workspace_id, key, expected_size, expected_mime)
        .await
        .map_err(napi::Error::from),
    }
  }

  fn config(&self) -> Result<StorageRuntimeConfig> {
    self
      .config
      .read()
      .map(|config| config.clone())
      .map_err(|_| RuntimeError::invalid_state("StorageRuntime config lock poisoned"))
  }

  fn update_config(&self, config: StorageRuntimeConfig) -> Result<()> {
    *self
      .config
      .write()
      .map_err(|_| RuntimeError::invalid_state("StorageRuntime config lock poisoned"))? = config;
    Ok(())
  }

  fn backend_for_scope(&self, scope: &str) -> Result<StorageBackendConfig> {
    self
      .config()?
      .backends
      .get(scope)
      .cloned()
      .or_else(|| self.config().ok()?.backends.get("blob").cloned())
      .ok_or_else(|| RuntimeError::config(format!("StorageRuntime provider is not configured for scope {scope}")))
  }

  pub(crate) async fn object_storage_delete_object(&self, key: &str) -> Result<()> {
    match self.backend_for_scope("blob")? {
      StorageBackendConfig::Fs(config) => fs_delete(&config, key),
      StorageBackendConfig::Assetpack(config) => assetpack::delete(&config, "blob", key).await,
      StorageBackendConfig::S3(config) => config.build_client()?.delete(key).await.map_err(Into::into),
    }
  }

  pub(crate) async fn object_storage_delete_many(&self, keys: Vec<String>) -> Result<Vec<ObjectDeleteOutcome>> {
    let backend = self.backend_for_scope("blob")?;
    match backend {
      StorageBackendConfig::Fs(config) => Ok(delete_many_fs(config, keys)),
      StorageBackendConfig::Assetpack(config) => delete_many_assetpack(config, keys).await,
      StorageBackendConfig::S3(config) => delete_many_s3(config, keys).await,
    }
  }

  pub(crate) async fn object_storage_abort_upload(&self, key: &str, upload_id: &str) -> Result<()> {
    match self.backend_for_scope("blob")? {
      StorageBackendConfig::Fs(_) | StorageBackendConfig::Assetpack(_) => Ok(()),
      StorageBackendConfig::S3(config) => config
        .build_client()?
        .abort_multipart_upload(key, upload_id)
        .await
        .map_err(Into::into),
    }
  }

  pub(crate) async fn object_storage_list_page(
    &self,
    prefix: Option<String>,
    continuation_token: Option<String>,
    start_after: Option<String>,
    max_keys: i32,
  ) -> Result<object_storage::types::ObjectListPage> {
    match self.backend_for_scope("blob")? {
      StorageBackendConfig::Fs(config) => {
        let mut entries = fs_list(&config, prefix)?;
        if let Some(start_after) = start_after {
          entries.retain(|entry| entry.key > start_after);
        }
        if continuation_token.is_some() {
          return Err(RuntimeError::invalid_input(
            "StorageRuntime fs list continuation token is not supported",
          ));
        }
        let max_keys = usize::try_from(max_keys)
          .map_err(|_| RuntimeError::invalid_input("StorageRuntime list maxKeys must be positive"))?;
        entries.truncate(max_keys);
        Ok(object_storage::types::ObjectListPage {
          entries,
          next_continuation_token: None,
        })
      }
      StorageBackendConfig::Assetpack(config) => {
        let mut entries = assetpack::list(&config, "blob", prefix).await?;
        if let Some(start_after) = start_after {
          entries.retain(|entry| entry.key > start_after);
        }
        if continuation_token.is_some() {
          return Err(RuntimeError::invalid_input(
            "StorageRuntime assetpack list continuation token is not supported",
          ));
        }
        let max_keys = usize::try_from(max_keys)
          .map_err(|_| RuntimeError::invalid_input("StorageRuntime list maxKeys must be positive"))?;
        entries.truncate(max_keys);
        Ok(object_storage::types::ObjectListPage {
          entries,
          next_continuation_token: None,
        })
      }
      StorageBackendConfig::S3(config) => config
        .build_client()?
        .list_page(prefix, continuation_token, start_after, max_keys)
        .await
        .map_err(Into::into),
    }
  }

  pub(crate) async fn object_storage_head(&self, key: String) -> Result<Option<RuntimeObjectMetadata>> {
    let metadata = match self.backend_for_scope("blob")? {
      StorageBackendConfig::Fs(config) => fs_head(&config, &key)?,
      StorageBackendConfig::Assetpack(config) => assetpack::head(&config, "blob", &key).await?,
      StorageBackendConfig::S3(config) => config.build_client()?.head(&key).await?,
    };
    Ok(metadata.map(Into::into))
  }

  async fn complete_fs_workspace_blob(
    &self,
    config: FsStorageConfig,
    workspace_id: String,
    key: String,
    expected_size: i64,
    expected_mime: String,
  ) -> Result<RuntimeBlobCompleteResult> {
    if !(0..=MAX_BLOB_SIZE).contains(&expected_size) {
      return Ok(blob_complete_failure("size_too_large"));
    }

    let storage_key = format!("{workspace_id}/{key}");
    let object = match fs_get(&config, &storage_key)? {
      Some(object) => object,
      None => return Ok(blob_complete_failure("not_found")),
    };
    let metadata = object.metadata;

    if !(0..=MAX_BLOB_SIZE).contains(&metadata.content_length) {
      let _ = fs_delete(&config, &storage_key);
      return Ok(blob_complete_failure("size_too_large"));
    }
    if metadata.content_length != expected_size {
      return Ok(blob_complete_failure("size_mismatch"));
    }
    if !expected_mime.is_empty() && metadata.content_type != expected_mime {
      return Ok(blob_complete_failure("mime_mismatch"));
    }
    if !sha256_base64_url_matches(&object.body, &key) {
      let _ = fs_delete(&config, &storage_key);
      return Ok(blob_complete_failure("checksum_mismatch"));
    }

    upsert_completed_blob(
      &self.pool().await?,
      &workspace_id,
      &key,
      &metadata.content_type,
      metadata.content_length,
    )
    .await?;
    Ok(blob_complete_success(
      metadata.content_type,
      metadata.content_length,
      metadata.last_modified_ms,
    ))
  }

  async fn complete_assetpack_workspace_blob(
    &self,
    config: FsStorageConfig,
    workspace_id: String,
    key: String,
    expected_size: i64,
    expected_mime: String,
  ) -> Result<RuntimeBlobCompleteResult> {
    if !(0..=MAX_BLOB_SIZE).contains(&expected_size) {
      return Ok(blob_complete_failure("size_too_large"));
    }

    let storage_key = format!("{workspace_id}/{key}");
    let object = match assetpack::get(&config, "blob", &storage_key).await? {
      Some(object) => object,
      None => return Ok(blob_complete_failure("not_found")),
    };
    let metadata = object.metadata;

    if !(0..=MAX_BLOB_SIZE).contains(&metadata.content_length) {
      let _ = assetpack::delete(&config, "blob", &storage_key).await;
      return Ok(blob_complete_failure("size_too_large"));
    }
    if metadata.content_length != expected_size {
      return Ok(blob_complete_failure("size_mismatch"));
    }
    if !expected_mime.is_empty() && metadata.content_type != expected_mime {
      return Ok(blob_complete_failure("mime_mismatch"));
    }
    if !sha256_base64_url_matches(&object.body, &key) {
      let _ = assetpack::delete(&config, "blob", &storage_key).await;
      return Ok(blob_complete_failure("checksum_mismatch"));
    }

    upsert_completed_blob(
      &self.pool().await?,
      &workspace_id,
      &key,
      &metadata.content_type,
      metadata.content_length,
    )
    .await?;
    Ok(blob_complete_success(
      metadata.content_type,
      metadata.content_length,
      metadata.last_modified_ms,
    ))
  }

  async fn complete_s3_workspace_blob(
    &self,
    workspace_id: String,
    key: String,
    expected_size: i64,
    expected_mime: String,
  ) -> Result<RuntimeBlobCompleteResult> {
    if !(0..=MAX_BLOB_SIZE).contains(&expected_size) {
      return Ok(blob_complete_failure("size_too_large"));
    }

    let object_key = format!("{workspace_id}/{key}");
    let config = match self.backend_for_scope("blob")? {
      StorageBackendConfig::S3(config) => config,
      _ => return Err(RuntimeError::invalid_state("BlobComplete expected S3 backend")),
    };
    let client = config.build_client()?;
    let object = match client.get(&object_key).await.map_err(RuntimeError::from) {
      Ok(Some(object)) => object,
      Ok(None) => return Ok(blob_complete_failure("not_found")),
      Err(err) if err.is_object_missing() => return Ok(blob_complete_failure("not_found")),
      Err(err) => return Err(err),
    };
    let metadata = object.metadata;

    if !(0..=MAX_BLOB_SIZE).contains(&metadata.content_length) {
      match client.delete(&object_key).await.map_err(RuntimeError::from) {
        Ok(()) => {}
        Err(err) if err.is_object_missing() => {}
        Err(err) => return Err(err),
      }
      return Ok(blob_complete_failure("size_too_large"));
    }
    if metadata.content_length != expected_size {
      return Ok(blob_complete_failure("size_mismatch"));
    }
    if !expected_mime.is_empty() && metadata.content_type != expected_mime {
      return Ok(blob_complete_failure("mime_mismatch"));
    }
    if !sha256_base64_url_matches(&object.body, &key) {
      match client.delete(&object_key).await.map_err(RuntimeError::from) {
        Ok(()) => {}
        Err(err) if err.is_object_missing() => {}
        Err(err) => return Err(err),
      }
      return Ok(blob_complete_failure("checksum_mismatch"));
    }

    upsert_completed_blob(
      &self.pool().await?,
      &workspace_id,
      &key,
      &metadata.content_type,
      metadata.content_length,
    )
    .await?;
    Ok(blob_complete_success(
      metadata.content_type,
      metadata.content_length,
      metadata.last_modified_ms,
    ))
  }

  async fn pool(&self) -> Result<PgPool> {
    self
      .pool
      .lock()
      .await
      .as_ref()
      .cloned()
      .ok_or_else(|| RuntimeError::invalid_state("StorageRuntime must be started before using postgres operations"))
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
    let raw = fs::read_to_string(&path).map_err(|err| RuntimeError::io("failed to read config file", err))?;
    let config: AppConfigFile =
      serde_json::from_str(&raw).map_err(|err| RuntimeError::json("failed to parse config file", err))?;
    merged.apply_file_config(config);
  }

  Ok(merged)
}

async fn load_app_config_overrides_from_db(pool: &PgPool) -> Result<AppConfigFile> {
  let rows = match sqlx::query("SELECT id, value FROM app_configs").fetch_all(pool).await {
    Ok(rows) => rows,
    Err(sqlx::Error::Database(err)) if err.code().as_deref() == Some("42P01") => return Ok(AppConfigFile::default()),
    Err(err) => return Err(RuntimeError::database("failed to load app config overrides", err)),
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
    .map_err(|err| RuntimeError::json("invalid app config overrides", err))
}

fn config_json_paths() -> Vec<PathBuf> {
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

fn fs_bucket_path(config: &FsStorageConfig) -> PathBuf {
  if let Some(stripped) = config.root.strip_prefix("~/")
    && let Ok(Some(home)) = homedir::my_home()
  {
    return home.join(stripped).join(&config.bucket);
  }
  Path::new(&config.root).join(&config.bucket)
}

fn normalize_storage_key(key: &str) -> Result<Vec<String>> {
  let normalized = key.replace('\\', "/");
  let segments = normalized.split('/').map(ToString::to_string).collect::<Vec<_>>();
  if normalized.is_empty()
    || normalized.starts_with('/')
    || segments
      .iter()
      .any(|segment| segment.is_empty() || segment == "." || segment == "..")
  {
    return Err(RuntimeError::invalid_input(format!("Invalid storage key: {key}")));
  }
  Ok(segments)
}

fn normalize_storage_prefix(prefix: &str) -> Result<String> {
  let normalized = prefix.replace('\\', "/");
  if normalized.is_empty() {
    return Ok(normalized);
  }
  if normalized.starts_with('/') {
    return Err(RuntimeError::invalid_input(format!("Invalid storage prefix: {prefix}")));
  }

  let mut segments = normalized.split('/').collect::<Vec<_>>();
  let last_segment = segments.pop();
  if last_segment.is_none()
    || segments
      .iter()
      .any(|segment| segment.is_empty() || *segment == "." || *segment == "..")
    || matches!(last_segment, Some(".") | Some(".."))
  {
    return Err(RuntimeError::invalid_input(format!("Invalid storage prefix: {prefix}")));
  }

  if matches!(last_segment, Some("")) {
    return Ok(format!("{}/", segments.join("/")));
  }

  Ok(normalized)
}

fn fs_object_path(config: &FsStorageConfig, key: &str) -> Result<PathBuf> {
  let mut path = fs_bucket_path(config);
  for segment in normalize_storage_key(key)? {
    path.push(segment);
  }
  Ok(path)
}

fn fs_put(config: &FsStorageConfig, key: &str, body: Vec<u8>, metadata: ObjectPutMetadata) -> Result<ObjectMetadata> {
  let path = fs_object_path(config, key)?;
  let metadata = metadata.complete_for_body(&body);
  if let Some(content_length) = metadata.content_length
    && content_length != body.len() as i64
  {
    return Err(RuntimeError::invalid_input("StorageRuntime fs content length mismatch"));
  }
  if let Some(checksum) = metadata.checksum_crc32.as_deref() {
    let actual = checksum_crc32_base64(&body);
    if actual != checksum {
      return Err(RuntimeError::invalid_input("StorageRuntime fs checksum mismatch"));
    }
  }
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|err| RuntimeError::io("StorageRuntime fs create dir failed", err))?;
  }
  fs::write(&path, &body).map_err(|err| RuntimeError::io("StorageRuntime fs write object failed", err))?;
  let object_metadata = metadata.into_object_metadata(system_time_ms(SystemTime::now())?);
  let metadata_json = serde_json::json!({
    "contentType": &object_metadata.content_type,
    "contentLength": object_metadata.content_length,
    "lastModified": object_metadata.last_modified_ms,
    "checksumCRC32": &object_metadata.checksum_crc32,
  });
  fs::write(
    PathBuf::from(format!("{}.metadata.json", path.display())),
    serde_json::to_vec(&metadata_json)
      .map_err(|err| RuntimeError::json("StorageRuntime fs serialize metadata failed", err))?,
  )
  .map_err(|err| RuntimeError::io("StorageRuntime fs write metadata failed", err))?;
  Ok(object_metadata)
}

fn fs_head(config: &FsStorageConfig, key: &str) -> Result<Option<ObjectMetadata>> {
  let path = fs_object_path(config, key)?;
  read_fs_metadata(&path)
}

fn fs_get(config: &FsStorageConfig, key: &str) -> Result<Option<ObjectGetResult>> {
  let path = fs_object_path(config, key)?;
  let Some(metadata) = read_fs_metadata(&path)? else {
    return Ok(None);
  };
  let body = match fs::read(&path) {
    Ok(body) => body,
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
    Err(err) => return Err(RuntimeError::io("StorageRuntime fs read object failed", err)),
  };
  Ok(Some(ObjectGetResult { body, metadata }))
}

fn fs_list(config: &FsStorageConfig, prefix: Option<String>) -> Result<Vec<ObjectListEntry>> {
  let root = fs_bucket_path(config);
  let prefix = prefix.map(|prefix| normalize_storage_prefix(&prefix)).transpose()?;
  let mut dir = root.clone();
  let mut name_prefix = prefix.as_deref();
  if let Some(prefix) = name_prefix
    && !prefix.is_empty()
  {
    let parts = prefix.split('/').collect::<Vec<_>>();
    if parts.len() > 1 {
      for part in &parts[..parts.len() - 1] {
        dir.push(part);
      }
      name_prefix = parts.last().copied();
    }
  }

  let mut entries = Vec::new();
  collect_fs_entries(&root, &dir, name_prefix, &mut entries)?;
  entries.sort_by(|a, b| a.key.cmp(&b.key));
  Ok(entries)
}

fn collect_fs_entries(
  root: &Path,
  dir: &Path,
  name_prefix: Option<&str>,
  entries: &mut Vec<ObjectListEntry>,
) -> Result<()> {
  let read_dir = match fs::read_dir(dir) {
    Ok(read_dir) => read_dir,
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
    Err(err) => return Err(RuntimeError::io("StorageRuntime fs list failed", err)),
  };

  for entry in read_dir {
    let entry = entry.map_err(|err| RuntimeError::io("StorageRuntime fs list entry failed", err))?;
    let path = entry.path();
    let name = entry.file_name().to_string_lossy().to_string();
    if path.is_dir() {
      if name_prefix.is_none_or(|prefix| name.starts_with(prefix)) {
        collect_fs_entries(root, &path, None, entries)?;
      }
    } else if !name.ends_with(".metadata.json") && name_prefix.is_none_or(|prefix| name.starts_with(prefix)) {
      let stat = entry
        .metadata()
        .map_err(|err| RuntimeError::io("StorageRuntime fs metadata failed", err))?;
      let key = path
        .strip_prefix(root)
        .map_err(|err| RuntimeError::invalid_state(format!("StorageRuntime fs path trim failed: {err}")))?
        .to_string_lossy()
        .replace('\\', "/");
      entries.push(ObjectListEntry {
        key,
        content_length: stat.len() as i64,
        last_modified_ms: stat
          .modified()
          .ok()
          .and_then(|time| system_time_ms(time).ok())
          .unwrap_or(0),
      });
    }
  }
  Ok(())
}

fn fs_delete(config: &FsStorageConfig, key: &str) -> Result<()> {
  let path = fs_object_path(config, key)?;
  match fs::remove_file(&path) {
    Ok(()) => {}
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
    Err(err) => return Err(RuntimeError::io("StorageRuntime fs delete object failed", err)),
  }
  match fs::remove_file(PathBuf::from(format!("{}.metadata.json", path.display()))) {
    Ok(()) => {}
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
    Err(err) => return Err(RuntimeError::io("StorageRuntime fs delete metadata failed", err)),
  }
  Ok(())
}

fn delete_many_fs(config: FsStorageConfig, keys: Vec<String>) -> Vec<ObjectDeleteOutcome> {
  keys
    .into_iter()
    .map(|key| {
      let error = fs_delete(&config, &key).err().map(|err| err.to_string());
      ObjectDeleteOutcome { key, error }
    })
    .collect()
}

async fn delete_many_assetpack(config: FsStorageConfig, keys: Vec<String>) -> Result<Vec<ObjectDeleteOutcome>> {
  let mut outcomes = Vec::with_capacity(keys.len());
  for key in keys {
    let error = assetpack::delete(&config, "blob", &key)
      .await
      .err()
      .map(|err| err.to_string());
    outcomes.push(ObjectDeleteOutcome { key, error });
  }
  Ok(outcomes)
}

async fn delete_many_s3(config: ObjectStorageConfig, keys: Vec<String>) -> Result<Vec<ObjectDeleteOutcome>> {
  let client = config.build_client()?;
  let mut chunks = keys
    .chunks(OBJECT_DELETE_MANY_CHUNK_SIZE)
    .map(|chunk| chunk.to_vec())
    .collect::<Vec<_>>()
    .into_iter();
  let mut tasks = JoinSet::new();
  let mut outcomes = Vec::new();

  for _ in 0..OBJECT_DELETE_MANY_CONCURRENCY {
    let Some(chunk) = chunks.next() else {
      break;
    };
    let client = client.clone();
    tasks.spawn(async move {
      let fallback = chunk.clone();
      let result = client.delete_many(chunk).await.map_err(RuntimeError::from);
      (fallback, result)
    });
  }

  while let Some(result) = tasks.join_next().await {
    match result {
      Ok((_chunk, Ok(batch_outcomes))) => outcomes.extend(batch_outcomes),
      Ok((chunk, Err(err))) => outcomes.extend(chunk.into_iter().map(|key| ObjectDeleteOutcome {
        key,
        error: Some(err.to_string()),
      })),
      Err(err) => {
        return Err(RuntimeError::invalid_state(format!(
          "StorageRuntime delete batch task failed: {err}"
        )));
      }
    }

    if let Some(chunk) = chunks.next() {
      let client = client.clone();
      tasks.spawn(async move {
        let fallback = chunk.clone();
        let result = client.delete_many(chunk).await.map_err(RuntimeError::from);
        (fallback, result)
      });
    }
  }

  Ok(outcomes)
}

fn read_fs_metadata(path: &Path) -> Result<Option<ObjectMetadata>> {
  let raw = match fs::read_to_string(PathBuf::from(format!("{}.metadata.json", path.display()))) {
    Ok(raw) => raw,
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
    Err(err) => return Err(RuntimeError::io("StorageRuntime fs read metadata failed", err)),
  };
  let metadata: FsBlobMetadata =
    serde_json::from_str(&raw).map_err(|err| RuntimeError::json("StorageRuntime fs parse metadata failed", err))?;
  Ok(Some(ObjectMetadata {
    content_type: metadata.content_type,
    content_length: metadata.content_length,
    last_modified_ms: metadata.last_modified,
    checksum_crc32: metadata.checksum_crc32,
  }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FsBlobMetadata {
  content_type: String,
  content_length: i64,
  last_modified: i64,
  #[serde(rename = "checksumCRC32")]
  checksum_crc32: Option<String>,
}

async fn upsert_completed_blob(pool: &PgPool, workspace_id: &str, key: &str, mime: &str, size: i64) -> Result<()> {
  if !(0..=MAX_BLOB_SIZE).contains(&size) {
    return Err(RuntimeError::invalid_input("BlobComplete size exceeds limit"));
  }
  let size = i32::try_from(size).map_err(|_| RuntimeError::invalid_input("BlobComplete size exceeds limit"))?;

  sqlx::query(
    r#"
    INSERT INTO blobs (workspace_id, key, mime, size, status, upload_id)
    VALUES ($1, $2, $3, $4, 'completed', NULL)
    ON CONFLICT (workspace_id, key)
    DO UPDATE SET
      mime = EXCLUDED.mime,
      size = EXCLUDED.size,
      status = EXCLUDED.status,
      upload_id = NULL
    "#,
  )
  .bind(workspace_id)
  .bind(key)
  .bind(mime)
  .bind(size)
  .execute(pool)
  .await
  .map_err(|err| RuntimeError::database("BlobComplete upsert metadata failed", err))?;

  Ok(())
}

fn blob_complete_failure(reason: &str) -> RuntimeBlobCompleteResult {
  RuntimeBlobCompleteResult {
    ok: false,
    reason: Some(reason.to_string()),
    content_type: None,
    content_length: None,
    last_modified_ms: None,
  }
}

fn blob_complete_success(
  content_type: String,
  content_length: i64,
  last_modified_ms: i64,
) -> RuntimeBlobCompleteResult {
  RuntimeBlobCompleteResult {
    ok: true,
    reason: None,
    content_type: Some(content_type),
    content_length: Some(content_length),
    last_modified_ms: Some(last_modified_ms),
  }
}

fn sha256_base64_url(body: &[u8]) -> String {
  URL_SAFE_NO_PAD.encode(Sha256::digest(body))
}

fn sha256_base64_url_matches(body: &[u8], key: &str) -> bool {
  sha256_base64_url(body) == key.trim_end_matches('=')
}

fn system_time_ms(time: SystemTime) -> Result<i64> {
  crate::utils::system_time_millis(time)
    .map(|millis| millis as i64)
    .map_err(|err| RuntimeError::Time {
      context: "system time before unix epoch".to_string(),
      source: err,
    })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn fs_key_normalization_rejects_traversal() {
    for (key, valid) in [
      ("", false),
      ("/a", false),
      ("a//b", false),
      ("a/./b", false),
      ("a/../b", false),
      ("..\\secret", false),
      ("workspace/blob", true),
      ("workspace\\blob", true),
    ] {
      assert_eq!(normalize_storage_key(key).is_ok(), valid, "{key}");
    }
    assert_eq!(normalize_storage_key("workspace/blob").unwrap(), ["workspace", "blob"]);
  }

  #[test]
  fn fs_prefix_normalization_rejects_traversal() {
    for (prefix, expected) in [
      ("", Some("")),
      ("workspace/", Some("workspace/")),
      ("workspace\\blob", Some("workspace/blob")),
      ("../escape", None),
      ("nested/../../escape", None),
      ("/absolute", None),
      ("nested//escape", None),
      ("nested/./escape", None),
      ("nested/../escape", None),
    ] {
      assert_eq!(normalize_storage_prefix(prefix).ok().as_deref(), expected, "{prefix}");
    }
  }

  #[test]
  fn capabilities_are_explicit_for_server_mediated_provider() {
    let capabilities = StorageBackendConfig::Fs(FsStorageConfig {
      provider: "fs".to_string(),
      root: "/tmp".to_string(),
      bucket: "blob".to_string(),
    })
    .capabilities();
    assert!(capabilities.put);
    assert!(!capabilities.presign_put);
    assert!(capabilities.server_mediated_only);
  }

  #[test]
  fn capabilities_enable_presign_get_for_presigned_s3_provider() {
    let capabilities = StorageBackendConfig::S3(ObjectStorageConfig {
      provider: "cloudflare-r2".to_string(),
      bucket: "blob".to_string(),
      endpoint: Some("https://account.r2.cloudflarestorage.com".to_string()),
      region: Some("auto".to_string()),
      access_key_id: Some("key".to_string()),
      secret_access_key: Some("secret".to_string()),
      session_token: None,
      force_path_style: true,
      request_timeout_ms: None,
      min_part_size: None,
      presign_expires_in_seconds: Some(60),
      presign_sign_content_type_for_put: Some(true),
      use_presigned_url: true,
      proxy_upload: false,
    })
    .capabilities();

    assert!(capabilities.presign_put);
    assert!(capabilities.presign_get);
    assert!(capabilities.multipart_direct);
    assert!(!capabilities.server_mediated_only);
  }

  #[test]
  fn capabilities_expose_r2_proxy_upload() {
    let capabilities = StorageBackendConfig::S3(ObjectStorageConfig {
      provider: "cloudflare-r2".to_string(),
      bucket: "blob".to_string(),
      endpoint: Some("https://account.r2.cloudflarestorage.com".to_string()),
      region: Some("auto".to_string()),
      access_key_id: Some("key".to_string()),
      secret_access_key: Some("secret".to_string()),
      session_token: None,
      force_path_style: true,
      request_timeout_ms: None,
      min_part_size: None,
      presign_expires_in_seconds: Some(60),
      presign_sign_content_type_for_put: Some(true),
      use_presigned_url: true,
      proxy_upload: true,
    })
    .capabilities();

    assert!(capabilities.proxy_upload);
    assert!(capabilities.presign_put);
    assert!(capabilities.multipart_direct);
  }

  #[test]
  fn capabilities_are_explicit_for_assetpack_provider() {
    let capabilities = StorageBackendConfig::Assetpack(FsStorageConfig {
      provider: "assetpack".to_string(),
      root: "/tmp".to_string(),
      bucket: "blob".to_string(),
    })
    .capabilities();

    assert!(capabilities.put);
    assert!(capabilities.get);
    assert!(capabilities.assetpack);
    assert!(!capabilities.presign_put);
    assert!(!capabilities.multipart_direct);
    assert!(capabilities.server_mediated_only);
  }

  #[test]
  fn assetpack_transform_specs_are_registered() {
    let specs = assetpack_transform_precomp2::default_specs();
    let ids = specs.iter().map(|spec| spec.id).collect::<Vec<_>>();

    assert!(ids.contains(&assetpack_core::TRANSFORM_ID_PRECOMP2));
    assert!(ids.contains(&assetpack_core::TRANSFORM_ID_PRECOMP2_ZSTD));
    assert!(ids.contains(&assetpack_core::TRANSFORM_ID_PRECOMP2_LZMA));
  }

  #[test]
  fn fs_backend_preserves_sidecar_metadata_format() {
    let temp = tempfile::tempdir().unwrap();
    let config = FsStorageConfig {
      provider: "fs".to_string(),
      root: temp.path().to_string_lossy().to_string(),
      bucket: "bucket".to_string(),
    };
    let body = b"hello".to_vec();
    let checksum = checksum_crc32_base64(&body);

    fs_put(
      &config,
      "workspace/blob",
      body.clone(),
      ObjectPutMetadata {
        content_type: Some("text/plain".to_string()),
        content_length: Some(body.len() as i64),
        checksum_crc32: Some(checksum.clone()),
      },
    )
    .unwrap();

    let object_path = temp.path().join("bucket/workspace/blob");
    assert_eq!(fs::read(&object_path).unwrap(), body);
    let sidecar: serde_json::Value =
      serde_json::from_slice(&fs::read(temp.path().join("bucket/workspace/blob.metadata.json")).unwrap()).unwrap();
    assert_eq!(sidecar["contentType"], "text/plain");
    assert_eq!(sidecar["contentLength"], 5);
    assert_eq!(sidecar["checksumCRC32"], checksum);
    assert!(sidecar["lastModified"].as_i64().unwrap() > 0);

    let metadata = fs_head(&config, "workspace/blob").unwrap().unwrap();
    assert_eq!(metadata.content_type, "text/plain");
    assert_eq!(metadata.content_length, 5);
    assert_eq!(metadata.checksum_crc32.as_deref(), Some(checksum.as_str()));
    assert_eq!(fs_get(&config, "workspace/blob").unwrap().unwrap().body, body);
  }

  #[test]
  fn fs_backend_reads_existing_node_sidecar_and_lists_prefixes() {
    let temp = tempfile::tempdir().unwrap();
    let config = FsStorageConfig {
      provider: "fs".to_string(),
      root: temp.path().to_string_lossy().to_string(),
      bucket: "bucket".to_string(),
    };
    let dir = temp.path().join("bucket/workspace");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("blob-a"), b"a").unwrap();
    fs::write(
      dir.join("blob-a.metadata.json"),
      r#"{"contentType":"text/plain","contentLength":1,"lastModified":123,"checksumCRC32":"e8b7be43"}"#,
    )
    .unwrap();
    fs::create_dir_all(dir.join("nested")).unwrap();
    fs::write(dir.join("nested/blob-b"), b"b").unwrap();
    fs::write(
      dir.join("nested/blob-b.metadata.json"),
      r#"{"contentType":"text/plain","contentLength":1,"lastModified":124}"#,
    )
    .unwrap();

    let metadata = fs_head(&config, "workspace/blob-a").unwrap().unwrap();
    assert_eq!(metadata.last_modified_ms, 123);
    assert_eq!(metadata.checksum_crc32.as_deref(), Some("e8b7be43"));

    let keys = fs_list(&config, Some("workspace/".to_string()))
      .unwrap()
      .into_iter()
      .map(|entry| entry.key)
      .collect::<Vec<_>>();
    assert_eq!(keys, ["workspace/blob-a", "workspace/nested/blob-b"]);
  }

  #[test]
  fn fs_backend_lists_old_node_prefix_semantics() {
    let temp = tempfile::tempdir().unwrap();
    let config = FsStorageConfig {
      provider: "fs".to_string(),
      root: temp.path().to_string_lossy().to_string(),
      bucket: "bucket".to_string(),
    };
    for key in ["root-a", "a/item", "a/b/item", "a/b/t/item", "a/b/tail", "z/item"] {
      fs_put(&config, key, key.as_bytes().to_vec(), ObjectPutMetadata::default()).unwrap();
    }

    for (prefix, expected) in [
      (
        None,
        vec!["a/b/item", "a/b/t/item", "a/b/tail", "a/item", "root-a", "z/item"],
      ),
      (Some("a"), vec!["a/b/item", "a/b/t/item", "a/b/tail", "a/item"]),
      (Some("a/b"), vec!["a/b/item", "a/b/t/item", "a/b/tail"]),
      (Some("a/b/"), vec!["a/b/item", "a/b/t/item", "a/b/tail"]),
      (Some("a/b/t"), vec!["a/b/t/item", "a/b/tail"]),
      (Some("missing"), vec![]),
    ] {
      let keys = fs_list(&config, prefix.map(ToString::to_string))
        .unwrap()
        .into_iter()
        .map(|entry| entry.key)
        .collect::<Vec<_>>();
      assert_eq!(keys, expected, "{prefix:?}");
    }
  }

  #[test]
  fn fs_backend_delete_removes_object_and_sidecar_idempotently() {
    let temp = tempfile::tempdir().unwrap();
    let config = FsStorageConfig {
      provider: "fs".to_string(),
      root: temp.path().to_string_lossy().to_string(),
      bucket: "bucket".to_string(),
    };

    fs_put(
      &config,
      "workspace/blob",
      b"body".to_vec(),
      ObjectPutMetadata::default(),
    )
    .unwrap();
    fs_delete(&config, "workspace/blob").unwrap();
    fs_delete(&config, "workspace/blob").unwrap();

    assert!(fs_head(&config, "workspace/blob").unwrap().is_none());
    assert!(fs_get(&config, "workspace/blob").unwrap().is_none());
    assert!(!temp.path().join("bucket/workspace/blob").exists());
    assert!(!temp.path().join("bucket/workspace/blob.metadata.json").exists());
  }

  fn test_storage_runtime() -> StorageRuntime {
    StorageRuntime {
      config: RwLock::new(StorageRuntimeConfig {
        database_url: "postgresql://unused".to_string(),
        backends: HashMap::new(),
      }),
      pool: Mutex::new(None),
    }
  }

  #[tokio::test]
  async fn fs_workspace_blob_complete_returns_native_failure_reasons_before_db_upsert() {
    let temp = tempfile::tempdir().unwrap();
    let config = FsStorageConfig {
      provider: "fs".to_string(),
      root: temp.path().to_string_lossy().to_string(),
      bucket: "bucket".to_string(),
    };
    let runtime = test_storage_runtime();

    let result = runtime
      .complete_fs_workspace_blob(
        config.clone(),
        "workspace".to_string(),
        "missing".to_string(),
        1,
        "text/plain".to_string(),
      )
      .await
      .unwrap();
    assert!(!result.ok);
    assert_eq!(result.reason.as_deref(), Some("not_found"));

    fs_put(
      &config,
      "workspace/blob",
      b"body".to_vec(),
      ObjectPutMetadata {
        content_type: Some("text/plain".to_string()),
        content_length: Some(4),
        checksum_crc32: None,
      },
    )
    .unwrap();
    let result = runtime
      .complete_fs_workspace_blob(
        config.clone(),
        "workspace".to_string(),
        "blob".to_string(),
        5,
        "text/plain".to_string(),
      )
      .await
      .unwrap();
    assert!(!result.ok);
    assert_eq!(result.reason.as_deref(), Some("size_mismatch"));

    let result = runtime
      .complete_fs_workspace_blob(
        config.clone(),
        "workspace".to_string(),
        "blob".to_string(),
        4,
        "image/png".to_string(),
      )
      .await
      .unwrap();
    assert!(!result.ok);
    assert_eq!(result.reason.as_deref(), Some("mime_mismatch"));

    let result = runtime
      .complete_fs_workspace_blob(
        config.clone(),
        "workspace".to_string(),
        "not-the-sha-key".to_string(),
        4,
        "text/plain".to_string(),
      )
      .await
      .unwrap();
    assert!(!result.ok);
    assert_eq!(result.reason.as_deref(), Some("not_found"));

    fs_put(
      &config,
      "workspace/not-the-sha-key",
      b"body".to_vec(),
      ObjectPutMetadata {
        content_type: Some("text/plain".to_string()),
        content_length: Some(4),
        checksum_crc32: None,
      },
    )
    .unwrap();
    let result = runtime
      .complete_fs_workspace_blob(
        config.clone(),
        "workspace".to_string(),
        "not-the-sha-key".to_string(),
        4,
        "text/plain".to_string(),
      )
      .await
      .unwrap();
    assert!(!result.ok);
    assert_eq!(result.reason.as_deref(), Some("checksum_mismatch"));
    assert!(fs_get(&config, "workspace/not-the-sha-key").unwrap().is_none());

    let result = runtime
      .complete_fs_workspace_blob(
        config,
        "workspace".to_string(),
        "too-large".to_string(),
        MAX_BLOB_SIZE + 1,
        "text/plain".to_string(),
      )
      .await
      .unwrap();
    assert!(!result.ok);
    assert_eq!(result.reason.as_deref(), Some("size_too_large"));
  }

  #[test]
  fn fs_backend_rejects_metadata_mismatch() {
    let temp = tempfile::tempdir().unwrap();
    let config = FsStorageConfig {
      provider: "fs".to_string(),
      root: temp.path().to_string_lossy().to_string(),
      bucket: "bucket".to_string(),
    };

    assert!(
      fs_put(
        &config,
        "workspace/blob",
        b"hello".to_vec(),
        ObjectPutMetadata {
          content_type: None,
          content_length: Some(10),
          checksum_crc32: None,
        },
      )
      .is_err()
    );
    assert!(
      fs_put(
        &config,
        "workspace/blob",
        b"hello".to_vec(),
        ObjectPutMetadata {
          content_type: None,
          content_length: None,
          checksum_crc32: Some("wrong".to_string()),
        },
      )
      .is_err()
    );
  }

  #[tokio::test]
  async fn assetpack_backend_roundtrips_manifest_and_body_in_assetpack_sqlite() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let config = FsStorageConfig {
      provider: "assetpack".to_string(),
      root: temp.path().to_string_lossy().to_string(),
      bucket: "bucket".to_string(),
    };
    let scope = format!("test_{}", uuid::Uuid::new_v4().simple());
    let key = "workspace/blob.txt";
    let body = b"assetpack body".repeat(512);

    assetpack::put(
      &config,
      &scope,
      key,
      body.clone(),
      ObjectPutMetadata {
        content_type: Some("text/plain".to_string()),
        content_length: Some(body.len() as i64),
        checksum_crc32: Some(checksum_crc32_base64(&body)),
      },
    )
    .await?;

    let head = assetpack::head(&config, &scope, key).await?.unwrap();
    assert_eq!(head.content_type, "text/plain");
    assert_eq!(head.content_length, body.len() as i64);

    let object = assetpack::get(&config, &scope, key).await?.unwrap();
    assert_eq!(object.body, body);
    assert_eq!(
      assetpack::list(&config, &scope, Some("workspace/".to_string()))
        .await?
        .len(),
      1
    );

    let percent_key = "workspace/%literal.txt";
    let wildcard_collision_key = "workspace/aliteral.txt";
    for key in [percent_key, wildcard_collision_key] {
      assetpack::put(
        &config,
        &scope,
        key,
        b"literal prefix body".to_vec(),
        ObjectPutMetadata {
          content_type: None,
          content_length: None,
          checksum_crc32: None,
        },
      )
      .await?;
    }
    let percent_matches = assetpack::list(&config, &scope, Some("workspace/%".to_string())).await?;
    assert_eq!(percent_matches.len(), 1);
    assert_eq!(percent_matches[0].key, percent_key);

    assetpack::delete(&config, &scope, key).await?;
    assert!(assetpack::head(&config, &scope, key).await?.is_none());
    Ok(())
  }
}
