use std::{
  fs,
  path::{Path, PathBuf},
};

use base64::{Engine as _, engine::general_purpose::URL_SAFE};
use napi::Result;
use serde::Deserialize;
use sha2::{Digest, Sha256};

use super::{BackendRuntime, error::napi_error, types::RuntimeBlobCompleteResult};

fn object_missing_error(err: &napi::Error) -> bool {
  let message = err.to_string();
  message.contains("NoSuchKey") || message.contains("NotFound") || message.contains("not found")
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

fn sha256_base64_url_with_padding(body: &[u8]) -> String {
  URL_SAFE.encode(Sha256::digest(body))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FsBlobMetadata {
  content_type: String,
  content_length: i64,
  last_modified: i64,
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
    return Err(napi_error(format!("Invalid storage key: {key}")));
  }

  Ok(segments)
}

fn fs_bucket_path(root: &str, bucket: &str) -> PathBuf {
  if let Some(stripped) = root.strip_prefix("~/")
    && let Ok(Some(home)) = homedir::my_home()
  {
    return home.join(stripped).join(bucket);
  }

  Path::new(root).join(bucket)
}

fn fs_object_path(root: &str, bucket: &str, key: &str) -> Result<PathBuf> {
  let mut path = fs_bucket_path(root, bucket);
  for segment in normalize_storage_key(key)? {
    path.push(segment);
  }
  Ok(path)
}

fn read_fs_metadata(path: &Path) -> Result<Option<FsBlobMetadata>> {
  let metadata_path = PathBuf::from(format!("{}.metadata.json", path.display()));
  let raw = match fs::read_to_string(metadata_path) {
    Ok(raw) => raw,
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
    Err(err) => {
      return Err(napi_error(format!("BlobComplete read fs metadata failed: {err}")));
    }
  };

  serde_json::from_str(&raw).map(Some).map_err(|err| {
    napi_error(format!(
      "BlobComplete parse fs metadata failed for {}: {err}",
      path.display()
    ))
  })
}

async fn upsert_completed_blob(
  runtime: &BackendRuntime,
  workspace_id: &str,
  key: &str,
  mime: &str,
  size: i64,
) -> Result<()> {
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
  .bind(size as i32)
  .execute(&runtime.pool().await?)
  .await
  .map_err(|err| napi_error(format!("BlobComplete upsert metadata failed: {err}")))?;

  Ok(())
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn complete_blob_upload(
    &self,
    workspace_id: String,
    key: String,
    expected_size: i64,
    expected_mime: String,
  ) -> Result<RuntimeBlobCompleteResult> {
    let object_key = format!("{workspace_id}/{key}");
    let object = match self.object_storage_get(object_key.clone()).await {
      Ok(Some(object)) => object,
      Ok(None) => return Ok(blob_complete_failure("not_found")),
      Err(err) if object_missing_error(&err) => return Ok(blob_complete_failure("not_found")),
      Err(err) => return Err(err),
    };

    if object.metadata.content_length != expected_size {
      return Ok(blob_complete_failure("size_mismatch"));
    }

    if !expected_mime.is_empty() && object.metadata.content_type != expected_mime {
      return Ok(blob_complete_failure("mime_mismatch"));
    }

    if sha256_base64_url_with_padding(&object.body) != key {
      match self.object_storage_delete(object_key).await {
        Ok(()) => {}
        Err(err) if object_missing_error(&err) => {}
        Err(err) => return Err(err),
      }
      return Ok(blob_complete_failure("checksum_mismatch"));
    }

    upsert_completed_blob(
      self,
      &workspace_id,
      &key,
      &object.metadata.content_type,
      object.metadata.content_length,
    )
    .await?;

    Ok(blob_complete_success(
      object.metadata.content_type,
      object.metadata.content_length,
      object.metadata.last_modified_ms,
    ))
  }

  #[napi]
  pub async fn complete_fs_blob_upload(
    &self,
    root: String,
    bucket: String,
    workspace_id: String,
    key: String,
    expected_size: i64,
    expected_mime: String,
  ) -> Result<RuntimeBlobCompleteResult> {
    let storage_key = format!("{workspace_id}/{key}");
    let path = fs_object_path(&root, &bucket, &storage_key)?;
    let metadata = match read_fs_metadata(&path)? {
      Some(metadata) => metadata,
      None => return Ok(blob_complete_failure("not_found")),
    };

    if metadata.content_length != expected_size {
      return Ok(blob_complete_failure("size_mismatch"));
    }

    if !expected_mime.is_empty() && metadata.content_type != expected_mime {
      return Ok(blob_complete_failure("mime_mismatch"));
    }

    let body = match fs::read(&path) {
      Ok(body) => body,
      Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(blob_complete_failure("not_found")),
      Err(err) => return Err(napi_error(format!("BlobComplete read fs object failed: {err}"))),
    };

    if sha256_base64_url_with_padding(&body) != key {
      let _ = fs::remove_file(&path);
      let _ = fs::remove_file(PathBuf::from(format!("{}.metadata.json", path.display())));
      return Ok(blob_complete_failure("checksum_mismatch"));
    }

    upsert_completed_blob(
      self,
      &workspace_id,
      &key,
      &metadata.content_type,
      metadata.content_length,
    )
    .await?;

    Ok(blob_complete_success(
      metadata.content_type,
      metadata.content_length,
      metadata.last_modified,
    ))
  }
}

#[cfg(test)]
mod tests {
  use super::sha256_base64_url_with_padding;

  #[test]
  fn sha256_base64_url_keeps_padding() {
    assert_eq!(
      sha256_base64_url_with_padding(b"hello"),
      "LPJNul-wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ="
    );
  }
}
