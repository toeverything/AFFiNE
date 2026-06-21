mod client;
mod config;
#[cfg(test)]
mod tests;
mod types;

use client::ObjectStorageClient;
pub(super) use config::ObjectStorageConfig;
use napi::{Result, bindgen_prelude::Buffer};
pub(super) use types::StorageProviderConfig;

use super::{
  BackendRuntime,
  types::{
    RuntimeMultipartUploadInit, RuntimeMultipartUploadPart, RuntimeObjectGetResult, RuntimeObjectListEntry,
    RuntimeObjectMetadata, RuntimeObjectStorageHealth, RuntimeObjectStoragePutOptions, RuntimePresignedObjectRequest,
  },
};

#[napi_derive::napi]
impl BackendRuntime {
  fn object_storage_client(&self) -> Result<ObjectStorageClient> {
    self
      .config
      .storage
      .as_ref()
      .ok_or_else(|| super::error::napi_error("ObjectStorageClient is not configured"))?
      .build_client()
  }

  pub(super) async fn object_storage_delete_object(&self, key: &str) -> Result<()> {
    self.object_storage_client()?.delete(key).await
  }

  pub(super) async fn object_storage_abort_upload(&self, key: &str, upload_id: &str) -> Result<()> {
    self
      .object_storage_client()?
      .abort_multipart_upload(key, upload_id)
      .await
  }

  #[napi]
  pub fn object_storage_health(&self) -> RuntimeObjectStorageHealth {
    match &self.config.storage {
      Some(storage) => storage.health(),
      None => RuntimeObjectStorageHealth {
        configured: false,
        provider: None,
        bucket: None,
        endpoint: None,
        region: None,
        has_credentials: false,
        force_path_style: false,
        request_timeout_ms: None,
        min_part_size: None,
        presign_expires_in_seconds: None,
        presign_sign_content_type_for_put: None,
        use_presigned_url: false,
        client_buildable: false,
      },
    }
  }

  #[napi]
  pub async fn object_storage_put(
    &self,
    key: String,
    body: Buffer,
    metadata: Option<RuntimeObjectStoragePutOptions>,
  ) -> Result<()> {
    self
      .object_storage_client()?
      .put(&key, body.to_vec(), metadata.map(Into::into).unwrap_or_default())
      .await
  }

  #[napi]
  pub async fn object_storage_presign_put(
    &self,
    key: String,
    metadata: Option<RuntimeObjectStoragePutOptions>,
  ) -> Result<RuntimePresignedObjectRequest> {
    self
      .object_storage_client()?
      .presign_put(&key, metadata.map(Into::into).unwrap_or_default())
      .await?
      .try_into()
  }

  #[napi]
  pub async fn object_storage_create_multipart_upload(
    &self,
    key: String,
    metadata: Option<RuntimeObjectStoragePutOptions>,
  ) -> Result<Option<RuntimeMultipartUploadInit>> {
    Ok(
      self
        .object_storage_client()?
        .create_multipart_upload(&key, metadata.map(Into::into).unwrap_or_default())
        .await?
        .map(Into::into),
    )
  }

  #[napi]
  pub async fn object_storage_presign_upload_part(
    &self,
    key: String,
    upload_id: String,
    part_number: i32,
  ) -> Result<RuntimePresignedObjectRequest> {
    self
      .object_storage_client()?
      .presign_upload_part(&key, &upload_id, part_number)
      .await?
      .try_into()
  }

  #[napi]
  pub async fn object_storage_list_multipart_upload_parts(
    &self,
    key: String,
    upload_id: String,
  ) -> Result<Vec<RuntimeMultipartUploadPart>> {
    Ok(
      self
        .object_storage_client()?
        .list_multipart_upload_parts(&key, &upload_id)
        .await?
        .into_iter()
        .map(Into::into)
        .collect(),
    )
  }

  #[napi]
  pub async fn object_storage_complete_multipart_upload(
    &self,
    key: String,
    upload_id: String,
    parts: Vec<RuntimeMultipartUploadPart>,
  ) -> Result<()> {
    self
      .object_storage_client()?
      .complete_multipart_upload(&key, &upload_id, parts.into_iter().map(Into::into).collect())
      .await
  }

  #[napi]
  pub async fn object_storage_abort_multipart_upload(&self, key: String, upload_id: String) -> Result<()> {
    self
      .object_storage_client()?
      .abort_multipart_upload(&key, &upload_id)
      .await
  }

  #[napi]
  pub async fn object_storage_head(&self, key: String) -> Result<Option<RuntimeObjectMetadata>> {
    Ok(self.object_storage_client()?.head(&key).await?.map(Into::into))
  }

  #[napi]
  pub async fn object_storage_get(&self, key: String) -> Result<Option<RuntimeObjectGetResult>> {
    Ok(self.object_storage_client()?.get(&key).await?.map(Into::into))
  }

  #[napi]
  pub async fn object_storage_list(&self, prefix: Option<String>) -> Result<Vec<RuntimeObjectListEntry>> {
    Ok(
      self
        .object_storage_client()?
        .list(prefix)
        .await?
        .into_iter()
        .map(Into::into)
        .collect(),
    )
  }

  #[napi]
  pub async fn object_storage_delete(&self, key: String) -> Result<()> {
    self.object_storage_client()?.delete(&key).await
  }
}
