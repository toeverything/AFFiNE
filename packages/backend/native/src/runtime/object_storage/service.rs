use std::collections::HashMap;

use sqlx::PgPool;
use tokio::task::JoinSet;

use super::{
  StorageBackendConfig, assetpack,
  backend::{backends_from_config_files, backends_from_config_json, backends_from_config_source, backends_from_db},
  fs::{delete_many_fs, fs_delete, fs_get, fs_head, fs_list, fs_put},
  types::{
    MultipartUploadInitResult, MultipartUploadPart, ObjectDeleteOutcome, ObjectGetResult, ObjectKey, ObjectListEntry,
    ObjectListPage, ObjectLocator, ObjectMetadata, ObjectPrefix, ObjectPutMetadata, PresignedObjectRequest,
    StorageScope,
  },
};
use crate::runtime::{ConfigSource, RuntimeError, RuntimeResult};

const DELETE_MANY_CHUNK_SIZE: usize = 500;
const DELETE_MANY_CONCURRENCY: usize = 3;

#[derive(Clone, Debug)]
pub(crate) struct ObjectStorageService {
  pub(in crate::runtime) backends: HashMap<String, StorageBackendConfig>,
}

impl ObjectStorageService {
  pub(crate) fn from_config_files() -> RuntimeResult<Self> {
    Ok(Self {
      backends: backends_from_config_files()?,
    })
  }

  pub(crate) fn from_config_source(source: &ConfigSource) -> RuntimeResult<Self> {
    Ok(Self {
      backends: backends_from_config_source(source)?,
    })
  }

  pub(in crate::runtime) fn from_config_json(config_json: &str) -> RuntimeResult<Self> {
    Ok(Self {
      backends: backends_from_config_json(config_json)?,
    })
  }

  pub(crate) async fn with_db_overrides(&self, pool: &PgPool) -> RuntimeResult<Self> {
    let mut backends = self.backends.clone();
    backends.extend(backends_from_db(pool).await?);
    Ok(Self { backends })
  }

  pub(in crate::runtime) fn backend_for_scope(&self, scope: StorageScope) -> RuntimeResult<StorageBackendConfig> {
    self
      .backends
      .get(scope.as_str())
      .cloned()
      .or_else(|| self.backends.get("blob").cloned())
      .ok_or_else(|| {
        RuntimeError::config(format!(
          "storage provider is not configured for scope {}",
          scope.as_str()
        ))
      })
  }

  pub(in crate::runtime) fn is_configured(&self) -> bool {
    !self.backends.is_empty()
  }

  pub(crate) async fn put(
    &self,
    locator: &ObjectLocator,
    body: Vec<u8>,
    metadata: ObjectPutMetadata,
  ) -> RuntimeResult<ObjectMetadata> {
    match self.backend_for_scope(locator.scope)? {
      StorageBackendConfig::Fs(config) => fs_put(&config, &locator.key, body, metadata),
      StorageBackendConfig::Assetpack(config) => {
        assetpack::put(&config, locator.scope.as_str(), &locator.key, body, metadata).await
      }
      StorageBackendConfig::S3(config) => config
        .build_client()?
        .put(&locator.key, body, metadata)
        .await
        .map_err(Into::into),
    }
  }

  pub(crate) async fn head(&self, locator: &ObjectLocator) -> RuntimeResult<Option<ObjectMetadata>> {
    match self.backend_for_scope(locator.scope)? {
      StorageBackendConfig::Fs(config) => fs_head(&config, &locator.key),
      StorageBackendConfig::Assetpack(config) => assetpack::head(&config, locator.scope.as_str(), &locator.key).await,
      StorageBackendConfig::S3(config) => config.build_client()?.head(&locator.key).await.map_err(Into::into),
    }
  }

  pub(crate) async fn get(&self, locator: &ObjectLocator) -> RuntimeResult<Option<ObjectGetResult>> {
    match self.backend_for_scope(locator.scope)? {
      StorageBackendConfig::Fs(config) => fs_get(&config, &locator.key),
      StorageBackendConfig::Assetpack(config) => assetpack::get(&config, locator.scope.as_str(), &locator.key).await,
      StorageBackendConfig::S3(config) => config.build_client()?.get(&locator.key).await.map_err(Into::into),
    }
  }

  pub(crate) async fn get_limited(
    &self,
    locator: &ObjectLocator,
    max_body_bytes: usize,
  ) -> RuntimeResult<Option<ObjectGetResult>> {
    match self.backend_for_scope(locator.scope)? {
      StorageBackendConfig::Fs(config) => {
        if fs_head(&config, &locator.key)?.is_some_and(|metadata| metadata.content_length > max_body_bytes as i64) {
          return Err(RuntimeError::invalid_input("resource_exceeded"));
        }
        let result = fs_get(&config, &locator.key)?;
        if result.as_ref().is_some_and(|object| object.body.len() > max_body_bytes) {
          return Err(RuntimeError::invalid_input("resource_exceeded"));
        }
        Ok(result)
      }
      StorageBackendConfig::Assetpack(config) => {
        if assetpack::head(&config, locator.scope.as_str(), &locator.key)
          .await?
          .is_some_and(|metadata| metadata.content_length > max_body_bytes as i64)
        {
          return Err(RuntimeError::invalid_input("resource_exceeded"));
        }
        let result = assetpack::get(&config, locator.scope.as_str(), &locator.key).await?;
        if result.as_ref().is_some_and(|object| object.body.len() > max_body_bytes) {
          return Err(RuntimeError::invalid_input("resource_exceeded"));
        }
        Ok(result)
      }
      StorageBackendConfig::S3(config) => config
        .build_client()?
        .get_limited(&locator.key, max_body_bytes)
        .await
        .map_err(Into::into),
    }
  }

  pub(crate) async fn list(
    &self,
    scope: StorageScope,
    prefix: Option<ObjectPrefix>,
  ) -> RuntimeResult<Vec<ObjectListEntry>> {
    match self.backend_for_scope(scope)? {
      StorageBackendConfig::Fs(config) => fs_list(&config, prefix.map(ObjectPrefix::into_string)),
      StorageBackendConfig::Assetpack(config) => {
        assetpack::list(&config, scope.as_str(), prefix.map(ObjectPrefix::into_string)).await
      }
      StorageBackendConfig::S3(config) => config.build_client()?.list(prefix).await.map_err(Into::into),
    }
  }

  pub(crate) async fn delete(&self, locator: &ObjectLocator) -> RuntimeResult<()> {
    match self.backend_for_scope(locator.scope)? {
      StorageBackendConfig::Fs(config) => fs_delete(&config, &locator.key),
      StorageBackendConfig::Assetpack(config) => assetpack::delete(&config, locator.scope.as_str(), &locator.key).await,
      StorageBackendConfig::S3(config) => config.build_client()?.delete(&locator.key).await.map_err(Into::into),
    }
  }

  pub(in crate::runtime) async fn presign_put(
    &self,
    locator: &ObjectLocator,
    metadata: ObjectPutMetadata,
  ) -> RuntimeResult<Option<PresignedObjectRequest>> {
    match self.backend_for_scope(locator.scope)? {
      StorageBackendConfig::Fs(_) | StorageBackendConfig::Assetpack(_) => Ok(None),
      StorageBackendConfig::S3(config) => config
        .build_client()?
        .presign_put(&locator.key, metadata)
        .await
        .map(Some)
        .map_err(Into::into),
    }
  }

  pub(in crate::runtime) async fn presign_get(
    &self,
    locator: &ObjectLocator,
  ) -> RuntimeResult<Option<PresignedObjectRequest>> {
    match self.backend_for_scope(locator.scope)? {
      StorageBackendConfig::Fs(_) | StorageBackendConfig::Assetpack(_) => Ok(None),
      StorageBackendConfig::S3(config) => {
        if let Some(request) = config.custom_presign_get(&locator.key)? {
          return Ok(Some(request));
        }
        config
          .build_client()?
          .presign_get(&locator.key)
          .await
          .map(Some)
          .map_err(Into::into)
      }
    }
  }

  pub(in crate::runtime) async fn create_multipart_upload(
    &self,
    locator: &ObjectLocator,
    metadata: ObjectPutMetadata,
  ) -> RuntimeResult<Option<MultipartUploadInitResult>> {
    match self.backend_for_scope(locator.scope)? {
      StorageBackendConfig::Fs(_) | StorageBackendConfig::Assetpack(_) => Ok(None),
      StorageBackendConfig::S3(config) => config
        .build_client()?
        .create_multipart_upload(&locator.key, metadata)
        .await
        .map_err(Into::into),
    }
  }

  pub(in crate::runtime) async fn presign_upload_part(
    &self,
    locator: &ObjectLocator,
    upload_id: &str,
    part_number: i32,
  ) -> RuntimeResult<Option<PresignedObjectRequest>> {
    match self.backend_for_scope(locator.scope)? {
      StorageBackendConfig::Fs(_) | StorageBackendConfig::Assetpack(_) => Ok(None),
      StorageBackendConfig::S3(config) => config
        .build_client()?
        .presign_upload_part(&locator.key, upload_id, part_number)
        .await
        .map(Some)
        .map_err(Into::into),
    }
  }

  pub(in crate::runtime) async fn upload_part(
    &self,
    locator: &ObjectLocator,
    upload_id: &str,
    part_number: i32,
    body: Vec<u8>,
    content_length: Option<i64>,
  ) -> RuntimeResult<Option<String>> {
    match self.backend_for_scope(locator.scope)? {
      StorageBackendConfig::Fs(_) | StorageBackendConfig::Assetpack(_) => Ok(None),
      StorageBackendConfig::S3(config) => config
        .build_client()?
        .upload_part(&locator.key, upload_id, part_number, body, content_length)
        .await
        .map_err(Into::into),
    }
  }

  pub(in crate::runtime) async fn list_multipart_upload_parts(
    &self,
    locator: &ObjectLocator,
    upload_id: &str,
  ) -> RuntimeResult<Option<Vec<MultipartUploadPart>>> {
    match self.backend_for_scope(locator.scope)? {
      StorageBackendConfig::Fs(_) | StorageBackendConfig::Assetpack(_) => Ok(None),
      StorageBackendConfig::S3(config) => config
        .build_client()?
        .list_multipart_upload_parts(&locator.key, upload_id)
        .await
        .map(Some)
        .map_err(Into::into),
    }
  }

  pub(in crate::runtime) async fn complete_multipart_upload(
    &self,
    locator: &ObjectLocator,
    upload_id: &str,
    parts: Vec<MultipartUploadPart>,
  ) -> RuntimeResult<bool> {
    match self.backend_for_scope(locator.scope)? {
      StorageBackendConfig::Fs(_) | StorageBackendConfig::Assetpack(_) => Ok(false),
      StorageBackendConfig::S3(config) => {
        config
          .build_client()?
          .complete_multipart_upload(&locator.key, upload_id, parts)
          .await?;
        Ok(true)
      }
    }
  }

  pub(in crate::runtime) async fn abort_multipart_upload(
    &self,
    locator: &ObjectLocator,
    upload_id: &str,
  ) -> RuntimeResult<bool> {
    match self.backend_for_scope(locator.scope)? {
      StorageBackendConfig::Fs(_) | StorageBackendConfig::Assetpack(_) => Ok(false),
      StorageBackendConfig::S3(config) => {
        config
          .build_client()?
          .abort_multipart_upload(&locator.key, upload_id)
          .await?;
        Ok(true)
      }
    }
  }

  pub(in crate::runtime) async fn delete_many(
    &self,
    scope: StorageScope,
    keys: Vec<ObjectKey>,
  ) -> RuntimeResult<Vec<ObjectDeleteOutcome>> {
    match self.backend_for_scope(scope)? {
      StorageBackendConfig::Fs(config) => Ok(delete_many_fs(
        config,
        keys.into_iter().map(ObjectKey::into_string).collect(),
      )),
      StorageBackendConfig::Assetpack(config) => {
        let mut outcomes = Vec::with_capacity(keys.len());
        for key in keys {
          let key = key.into_string();
          let error = assetpack::delete(&config, scope.as_str(), &key)
            .await
            .err()
            .map(|err| err.to_string());
          outcomes.push(ObjectDeleteOutcome { key, error });
        }
        Ok(outcomes)
      }
      StorageBackendConfig::S3(config) => {
        let client = config.build_client()?;
        let mut chunks = keys
          .chunks(DELETE_MANY_CHUNK_SIZE)
          .map(|chunk| chunk.to_vec())
          .collect::<Vec<_>>()
          .into_iter();
        let mut tasks = JoinSet::new();
        let mut outcomes = Vec::new();

        for _ in 0..DELETE_MANY_CONCURRENCY {
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
              key: key.into_string(),
              error: Some(err.to_string()),
            })),
            Err(err) => {
              return Err(RuntimeError::invalid_state(format!(
                "Object storage delete batch task failed: {err}"
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
    }
  }

  pub(in crate::runtime) async fn list_page(
    &self,
    scope: StorageScope,
    prefix: Option<ObjectPrefix>,
    continuation_token: Option<String>,
    start_after: Option<ObjectKey>,
    max_keys: i32,
  ) -> RuntimeResult<ObjectListPage> {
    match self.backend_for_scope(scope)? {
      StorageBackendConfig::Fs(config) => {
        let mut entries = fs_list(&config, prefix.map(ObjectPrefix::into_string))?;
        if let Some(start_after) = start_after {
          entries.retain(|entry| entry.key.as_str() > start_after.as_str());
        }
        if continuation_token.is_some() {
          return Err(RuntimeError::invalid_input(
            "FS list continuation token is not supported",
          ));
        }
        let max_keys = usize::try_from(max_keys)
          .map_err(|_| RuntimeError::invalid_input("Object storage list maxKeys must be positive"))?;
        entries.truncate(max_keys);
        Ok(ObjectListPage {
          entries,
          next_continuation_token: None,
        })
      }
      StorageBackendConfig::Assetpack(config) => {
        let mut entries = assetpack::list(&config, scope.as_str(), prefix.map(ObjectPrefix::into_string)).await?;
        if let Some(start_after) = start_after {
          entries.retain(|entry| entry.key.as_str() > start_after.as_str());
        }
        if continuation_token.is_some() {
          return Err(RuntimeError::invalid_input(
            "Assetpack list continuation token is not supported",
          ));
        }
        let max_keys = usize::try_from(max_keys)
          .map_err(|_| RuntimeError::invalid_input("Object storage list maxKeys must be positive"))?;
        entries.truncate(max_keys);
        Ok(ObjectListPage {
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
}
