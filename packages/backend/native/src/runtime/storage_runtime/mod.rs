use std::sync::RwLock;

use napi::bindgen_prelude::Buffer;
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use tokio::sync::Mutex;

mod blob_cleanup;
mod blob_completion;
mod blob_reclaimer;
mod blob_reconciliation;
mod capabilities;
mod config;
mod current_doc;
mod doc_blob_refs;
mod document_cleanup;
pub use capabilities::StorageProviderCapabilities;
use capabilities::storage_provider_capabilities;
use config::StorageRuntimeConfig;
pub(super) use current_doc::load_current_doc;
use current_doc::{
  CurrentDoc, CurrentDocUpdate, load_canonical_doc, load_workspace_canonical_doc_ids, load_workspace_live_doc_ids,
  merge_current_doc,
};

use super::object_storage::{
  self, ObjectStorageService, StorageBackendConfig,
  types::{ObjectDeleteOutcome, ObjectKey, ObjectLocator, ObjectPrefix, StorageScope},
};
pub(super) use super::{
  RuntimeError, RuntimeResult,
  migrations::migrate_runtime_tables,
  napi_error, to_napi_error,
  types::{
    RuntimeBlobCleanupExecuteResult, RuntimeBlobCleanupPlanResult, RuntimeBlobCleanupResult, RuntimeBlobCompleteResult,
    RuntimeBlobMetadataBackfillResult, RuntimeDocBlobRefsResult, RuntimeDocumentCleanupEffect,
    RuntimeDocumentCleanupExecuteResult, RuntimeDocumentCleanupReconcileResult, RuntimeMultipartUploadInit,
    RuntimeMultipartUploadPart, RuntimeObjectGetResult, RuntimeObjectListEntry, RuntimeObjectMetadata,
    RuntimeObjectStoragePutOptions, RuntimePresignedObjectRequest,
  },
};

type Result<T> = RuntimeResult<T>;

#[napi_derive::napi(object)]
pub struct StorageRuntimeHealth {
  pub started: bool,
  pub database_connected: bool,
  pub provider_configured: bool,
  pub provider: Option<String>,
  pub bucket: Option<String>,
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
    let config = StorageRuntimeConfig::from_config_json(&config_json).map_err(to_napi_error)?;
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
    let service = self.config()?.object_storage;
    let backend = service.backends.get("blob").cloned();

    Ok(StorageRuntimeHealth {
      started: pool.is_some(),
      database_connected,
      provider_configured: service.is_configured(),
      provider: backend.as_ref().map(|backend| backend.provider().to_string()),
      bucket: backend.as_ref().map(|backend| backend.bucket().to_string()),
    })
  }

  #[napi]
  pub async fn provider_capabilities(&self, scope: String) -> napi::Result<StorageProviderCapabilities> {
    self
      .backend_for_scope(&scope)
      .map(|backend| storage_provider_capabilities(&backend))
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn put_object(
    &self,
    scope: String,
    key: String,
    body: Buffer,
    metadata: Option<RuntimeObjectStoragePutOptions>,
  ) -> napi::Result<RuntimeObjectMetadata> {
    let locator = ObjectLocator::new_writer(&scope, key)?;
    self
      .object_storage()?
      .put(&locator, body.to_vec(), metadata.map(Into::into).unwrap_or_default())
      .await
      .map(Into::into)
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn head_object(&self, scope: String, key: String) -> napi::Result<Option<RuntimeObjectMetadata>> {
    let locator = ObjectLocator::new(StorageScope::parse(&scope)?, ObjectKey::new(key)?);
    let metadata = self.object_storage()?.head(&locator).await.map_err(to_napi_error)?;
    Ok(metadata.map(Into::into))
  }

  #[napi]
  pub async fn get_object(&self, scope: String, key: String) -> napi::Result<Option<RuntimeObjectGetResult>> {
    let locator = ObjectLocator::new(StorageScope::parse(&scope)?, ObjectKey::new(key)?);
    let object = self.object_storage()?.get(&locator).await.map_err(to_napi_error)?;
    Ok(object.map(Into::into))
  }

  #[napi]
  pub async fn list_objects(&self, scope: String, prefix: Option<String>) -> napi::Result<Vec<RuntimeObjectListEntry>> {
    let scope = StorageScope::parse(&scope)?;
    let prefix = prefix.map(ObjectPrefix::new).transpose()?;
    let entries = self
      .object_storage()?
      .list(scope, prefix)
      .await
      .map_err(to_napi_error)?;
    Ok(entries.into_iter().map(Into::into).collect())
  }

  #[napi]
  pub async fn delete_object(&self, scope: String, key: String) -> napi::Result<()> {
    let locator = ObjectLocator::new(StorageScope::parse(&scope)?, ObjectKey::new(key)?);
    self.object_storage()?.delete(&locator).await.map_err(to_napi_error)
  }

  #[napi]
  pub async fn presign_put(
    &self,
    scope: String,
    key: String,
    metadata: Option<RuntimeObjectStoragePutOptions>,
  ) -> napi::Result<Option<RuntimePresignedObjectRequest>> {
    let locator = ObjectLocator::new_writer(&scope, key)?;
    self
      .object_storage()?
      .presign_put(&locator, metadata.map(Into::into).unwrap_or_default())
      .await
      .map_err(to_napi_error)?
      .map(TryInto::try_into)
      .transpose()
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn presign_get(&self, scope: String, key: String) -> napi::Result<Option<RuntimePresignedObjectRequest>> {
    let locator = ObjectLocator::new(StorageScope::parse(&scope)?, ObjectKey::new(key)?);
    self
      .object_storage()?
      .presign_get(&locator)
      .await
      .map_err(to_napi_error)?
      .map(TryInto::try_into)
      .transpose()
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn create_multipart_upload(
    &self,
    scope: String,
    key: String,
    metadata: Option<RuntimeObjectStoragePutOptions>,
  ) -> napi::Result<Option<RuntimeMultipartUploadInit>> {
    let locator = ObjectLocator::new_writer(&scope, key)?;
    self
      .object_storage()?
      .create_multipart_upload(&locator, metadata.map(Into::into).unwrap_or_default())
      .await
      .map(|upload| upload.map(Into::into))
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn presign_upload_part(
    &self,
    scope: String,
    key: String,
    upload_id: String,
    part_number: i32,
  ) -> napi::Result<Option<RuntimePresignedObjectRequest>> {
    let locator = ObjectLocator::new_writer(&scope, key)?;
    self
      .object_storage()?
      .presign_upload_part(&locator, &upload_id, part_number)
      .await
      .map_err(to_napi_error)?
      .map(TryInto::try_into)
      .transpose()
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn proxy_upload_part(
    &self,
    scope: String,
    key: String,
    upload_id: String,
    part_number: i32,
    body: Buffer,
    content_length: Option<i64>,
  ) -> napi::Result<Option<String>> {
    let locator = ObjectLocator::new_writer(&scope, key)?;
    self
      .object_storage()?
      .upload_part(&locator, &upload_id, part_number, body.to_vec(), content_length)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn list_multipart_upload_parts(
    &self,
    scope: String,
    key: String,
    upload_id: String,
  ) -> napi::Result<Option<Vec<RuntimeMultipartUploadPart>>> {
    let locator = ObjectLocator::new(StorageScope::parse(&scope)?, ObjectKey::new(key)?);
    self
      .object_storage()?
      .list_multipart_upload_parts(&locator, &upload_id)
      .await
      .map(|parts| parts.map(|parts| parts.into_iter().map(Into::into).collect()))
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn complete_multipart_upload(
    &self,
    scope: String,
    key: String,
    upload_id: String,
    parts: Vec<RuntimeMultipartUploadPart>,
  ) -> napi::Result<bool> {
    let locator = ObjectLocator::new(StorageScope::parse(&scope)?, ObjectKey::new(key)?);
    self
      .object_storage()?
      .complete_multipart_upload(&locator, &upload_id, parts.into_iter().map(Into::into).collect())
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn abort_multipart_upload(&self, scope: String, key: String, upload_id: String) -> napi::Result<bool> {
    let locator = ObjectLocator::new(StorageScope::parse(&scope)?, ObjectKey::new(key)?);
    self
      .object_storage()?
      .abort_multipart_upload(&locator, &upload_id)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn complete_workspace_blob_upload(
    &self,
    workspace_id: String,
    key: String,
    expected_size: i64,
    expected_mime: String,
  ) -> napi::Result<RuntimeBlobCompleteResult> {
    self
      .complete_workspace_blob(workspace_id, key, expected_size, expected_mime)
      .await
      .map_err(napi::Error::from)
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

  fn object_storage(&self) -> Result<ObjectStorageService> {
    Ok(self.config()?.object_storage)
  }

  fn backend_for_scope(&self, scope: &str) -> Result<StorageBackendConfig> {
    let scope = StorageScope::parse(scope)?;
    self.config()?.object_storage.backend_for_scope(scope)
  }

  pub(crate) async fn object_storage_delete_object(&self, key: &str) -> Result<()> {
    let locator = ObjectLocator::new(StorageScope::Blob, ObjectKey::new(key)?);
    self.object_storage()?.delete(&locator).await
  }

  pub(crate) async fn object_storage_delete_many(&self, keys: Vec<String>) -> Result<Vec<ObjectDeleteOutcome>> {
    let keys = keys
      .into_iter()
      .map(ObjectKey::new)
      .collect::<object_storage::error::ObjectStorageResult<Vec<_>>>()?;
    self.object_storage()?.delete_many(StorageScope::Blob, keys).await
  }

  pub(crate) async fn object_storage_abort_upload(&self, key: &str, upload_id: &str) -> Result<()> {
    let locator = ObjectLocator::new(StorageScope::Blob, ObjectKey::new(key)?);
    self
      .object_storage()?
      .abort_multipart_upload(&locator, upload_id)
      .await?;
    Ok(())
  }

  pub(crate) async fn object_storage_list_page(
    &self,
    prefix: Option<String>,
    continuation_token: Option<String>,
    start_after: Option<String>,
    max_keys: i32,
  ) -> Result<object_storage::types::ObjectListPage> {
    let prefix = prefix.map(ObjectPrefix::new).transpose()?;
    let start_after = start_after.map(ObjectKey::new).transpose()?;
    self
      .object_storage()?
      .list_page(StorageScope::Blob, prefix, continuation_token, start_after, max_keys)
      .await
  }

  pub(crate) async fn object_storage_head(&self, key: String) -> Result<Option<RuntimeObjectMetadata>> {
    let locator = ObjectLocator::new(StorageScope::Blob, ObjectKey::new(key)?);
    let metadata = self.object_storage()?.head(&locator).await?;
    Ok(metadata.map(Into::into))
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
