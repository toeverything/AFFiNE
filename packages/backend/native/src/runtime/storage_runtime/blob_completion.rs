use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use sha2::{Digest, Sha256};
use sqlx::PgPool;

use super::{Result, RuntimeBlobCompleteResult, RuntimeError, StorageRuntime};
use crate::runtime::object_storage::{
  MAX_BLOB_SIZE,
  types::{ObjectLocator, StorageScope, WorkspaceBlobKey},
};

impl StorageRuntime {
  pub(super) async fn complete_workspace_blob(
    &self,
    workspace_id: String,
    key: String,
    expected_size: i64,
    expected_mime: String,
  ) -> Result<RuntimeBlobCompleteResult> {
    if !(0..=MAX_BLOB_SIZE).contains(&expected_size) {
      return Ok(blob_complete_failure("size_too_large"));
    }

    let locator = ObjectLocator::new(
      StorageScope::Blob,
      WorkspaceBlobKey::new(&workspace_id, &key)?.into_object_key(),
    );
    let storage = self.object_storage()?;
    let object = match storage.get(&locator).await? {
      Some(object) => object,
      None => return Ok(blob_complete_failure("not_found")),
    };
    let metadata = object.metadata;

    if !(0..=MAX_BLOB_SIZE).contains(&metadata.content_length) {
      storage.delete(&locator).await?;
      return Ok(blob_complete_failure("size_too_large"));
    }
    if metadata.content_length != expected_size {
      return Ok(blob_complete_failure("size_mismatch"));
    }
    if !expected_mime.is_empty() && metadata.content_type != expected_mime {
      return Ok(blob_complete_failure("mime_mismatch"));
    }
    if !sha256_base64_url_matches(&object.body, &key) {
      storage.delete(&locator).await?;
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

#[cfg(test)]
mod tests {
  use std::{collections::HashMap, sync::RwLock};

  use tokio::sync::Mutex;

  use super::*;
  use crate::runtime::{
    object_storage::{FsStorageConfig, ObjectStorageService, StorageBackendConfig, types::ObjectPutMetadata},
    storage_runtime::StorageRuntimeConfig,
  };

  fn test_storage_runtime(config: FsStorageConfig) -> StorageRuntime {
    StorageRuntime {
      config: RwLock::new(StorageRuntimeConfig {
        database_url: "postgresql://unused".to_string(),
        object_storage: ObjectStorageService {
          backends: HashMap::from([("blob".to_string(), StorageBackendConfig::Fs(config))]),
        },
      }),
      pool: Mutex::new(None),
    }
  }

  async fn put_test_blob(runtime: &StorageRuntime, workspace_id: &str, key: &str, body: &[u8], mime: &str) {
    let locator = ObjectLocator::new(
      StorageScope::Blob,
      WorkspaceBlobKey::new(workspace_id, key).unwrap().into_object_key(),
    );
    runtime
      .object_storage()
      .unwrap()
      .put(
        &locator,
        body.to_vec(),
        ObjectPutMetadata {
          content_type: Some(mime.to_string()),
          content_length: Some(body.len() as i64),
          checksum_crc32: None,
        },
      )
      .await
      .unwrap();
  }

  #[tokio::test]
  async fn workspace_blob_complete_uses_object_storage_service_before_db_upsert() {
    let temp = tempfile::tempdir().unwrap();
    let runtime = test_storage_runtime(FsStorageConfig {
      provider: "fs".to_string(),
      root: temp.path().to_string_lossy().to_string(),
      bucket: "bucket".to_string(),
    });
    let workspace_id = "workspace";
    let body = b"body";
    let key = sha256_base64_url(body);

    let missing_key = sha256_base64_url(b"missing");
    let result = runtime
      .complete_workspace_blob(workspace_id.to_string(), missing_key, 1, "text/plain".to_string())
      .await
      .unwrap();
    assert_eq!(result.reason.as_deref(), Some("not_found"));

    put_test_blob(&runtime, workspace_id, &key, body, "text/plain").await;
    let result = runtime
      .complete_workspace_blob(workspace_id.to_string(), key.clone(), 5, "text/plain".to_string())
      .await
      .unwrap();
    assert_eq!(result.reason.as_deref(), Some("size_mismatch"));

    let result = runtime
      .complete_workspace_blob(workspace_id.to_string(), key, 4, "image/png".to_string())
      .await
      .unwrap();
    assert_eq!(result.reason.as_deref(), Some("mime_mismatch"));

    let mismatched_key = sha256_base64_url(b"different body");
    put_test_blob(&runtime, workspace_id, &mismatched_key, body, "text/plain").await;
    let result = runtime
      .complete_workspace_blob(
        workspace_id.to_string(),
        mismatched_key.clone(),
        4,
        "text/plain".to_string(),
      )
      .await
      .unwrap();
    assert_eq!(result.reason.as_deref(), Some("checksum_mismatch"));

    let locator = ObjectLocator::new(
      StorageScope::Blob,
      WorkspaceBlobKey::new(workspace_id, &mismatched_key)
        .unwrap()
        .into_object_key(),
    );
    assert!(
      runtime
        .object_storage()
        .unwrap()
        .head(&locator)
        .await
        .unwrap()
        .is_none()
    );

    let result = runtime
      .complete_workspace_blob(
        workspace_id.to_string(),
        sha256_base64_url(b"large"),
        MAX_BLOB_SIZE + 1,
        "text/plain".to_string(),
      )
      .await
      .unwrap();
    assert_eq!(result.reason.as_deref(), Some("size_too_large"));
  }
}
