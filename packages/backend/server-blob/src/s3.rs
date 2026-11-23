//! S3-compatible object storage over presigned `rusty-s3` requests sent with
//! `reqwest`, following the reference `ObjectStorageClient`
//! (`packages/backend/native/src/runtime/object_storage/client.rs`): signed
//! `content-type`/`content-length`/`x-amz-checksum-crc32` on PUT, and a 404
//! answered as a missing object.

use std::time::Duration;

use reqwest::{
  Method, StatusCode,
  header::{CONTENT_LENGTH, CONTENT_TYPE, HeaderMap, LAST_MODIFIED},
};
use rusty_s3::{
  Bucket, Credentials, S3Action, UrlStyle,
  actions::{DeleteObject, GetObject, HeadObject, PutObject},
};
use url::Url;

use crate::storage::{BlobStorageBackend, ObjectMetadata, StorageError, checksum_crc32_base64, normalize_storage_key};

const DEFAULT_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_PRESIGN_EXPIRES: Duration = Duration::from_secs(60);

/// Connection settings of one S3-compatible bucket.
#[derive(Clone)]
pub struct S3Config {
  /// `None` resolves the AWS endpoint of `region`.
  pub endpoint: Option<String>,
  pub region: String,
  pub bucket: String,
  pub access_key_id: String,
  pub secret_access_key: String,
  pub session_token: Option<String>,
  pub force_path_style: bool,
  pub request_timeout: Option<Duration>,
}

impl std::fmt::Debug for S3Config {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    f.debug_struct("S3Config")
      .field("endpoint", &self.endpoint)
      .field("region", &self.region)
      .field("bucket", &self.bucket)
      .field("access_key_id", &self.access_key_id)
      .field("secret_access_key", &"[REDACTED]")
      .field("session_token", &self.session_token.as_ref().map(|_| "[REDACTED]"))
      .field("force_path_style", &self.force_path_style)
      .field("request_timeout", &self.request_timeout)
      .finish()
  }
}

#[derive(Clone)]
pub struct S3BlobStorage {
  bucket: Bucket,
  credentials: Credentials,
  http: reqwest::Client,
}

fn resolve_s3_endpoint(region: &str) -> String {
  if region == "us-east-1" {
    "https://s3.amazonaws.com".to_owned()
  } else {
    format!("https://s3.{region}.amazonaws.com")
  }
}

/// `reqwest` errors are passed through `without_url` first: the request URL is
/// presigned and carries the credential scope and signature.
fn request_error(context: &str, err: impl std::fmt::Display) -> StorageError {
  StorageError::Request {
    context: context.to_owned(),
    message: err.to_string(),
  }
}

fn metadata_from_headers(headers: &HeaderMap) -> ObjectMetadata {
  let header = |name: &str| headers.get(name).and_then(|value| value.to_str().ok());
  ObjectMetadata {
    content_type: header(CONTENT_TYPE.as_str())
      .unwrap_or("application/octet-stream")
      .to_owned(),
    content_length: header(CONTENT_LENGTH.as_str())
      .and_then(|v| v.parse().ok())
      .unwrap_or(0),
    last_modified_ms: header(LAST_MODIFIED.as_str())
      .and_then(|v| chrono::DateTime::parse_from_rfc2822(v).ok())
      .map(|time| time.timestamp_millis())
      .unwrap_or(0),
    checksum_crc32: header("x-amz-checksum-crc32").map(str::to_owned),
  }
}

impl S3BlobStorage {
  pub fn new(config: S3Config) -> Result<Self, StorageError> {
    let endpoint = config
      .endpoint
      .clone()
      .unwrap_or_else(|| resolve_s3_endpoint(&config.region));
    let endpoint = Url::parse(&endpoint).map_err(|err| StorageError::Config(format!("invalid endpoint: {err}")))?;
    let style = if config.force_path_style {
      UrlStyle::Path
    } else {
      UrlStyle::VirtualHost
    };
    let bucket = Bucket::new(endpoint, style, config.bucket, config.region)
      .map_err(|err| StorageError::Config(format!("invalid bucket url: {err}")))?;
    let credentials = match config.session_token.filter(|token| !token.is_empty()) {
      Some(token) => Credentials::new_with_token(config.access_key_id, config.secret_access_key, token),
      None => Credentials::new(config.access_key_id, config.secret_access_key),
    };
    let http = reqwest::Client::builder()
      .timeout(config.request_timeout.unwrap_or(DEFAULT_REQUEST_TIMEOUT))
      .build()
      .map_err(|err| StorageError::Config(format!("http client: {err}")))?;
    Ok(Self {
      bucket,
      credentials,
      http,
    })
  }

  async fn send(
    &self,
    context: &str,
    method: Method,
    url: Url,
    headers: &[(&str, String)],
    body: Option<Vec<u8>>,
  ) -> Result<reqwest::Response, StorageError> {
    let mut request = self.http.request(method, url);
    for (name, value) in headers {
      request = request.header(*name, value);
    }
    if let Some(body) = body {
      request = request.body(body);
    }
    request
      .send()
      .await
      .map_err(|err| request_error(context, err.without_url()))
  }

  async fn ensure_success(context: &str, response: reqwest::Response) -> Result<reqwest::Response, StorageError> {
    if response.status().is_success() {
      return Ok(response);
    }
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    Err(request_error(
      context,
      format!("HTTP {status}: {}", body.chars().take(512).collect::<String>()),
    ))
  }
}

#[async_trait::async_trait]
impl BlobStorageBackend for S3BlobStorage {
  async fn put(&self, key: &str, body: Vec<u8>, content_type: &str) -> Result<ObjectMetadata, StorageError> {
    normalize_storage_key(key)?;
    let checksum = checksum_crc32_base64(&body);
    let headers = [
      ("content-type", content_type.to_owned()),
      ("content-length", body.len().to_string()),
      ("x-amz-checksum-crc32", checksum.clone()),
    ];
    let mut action = PutObject::new(&self.bucket, Some(&self.credentials), key);
    for (name, value) in &headers {
      action.headers_mut().insert(*name, value.clone());
    }
    let url = action.sign(DEFAULT_PRESIGN_EXPIRES);
    let context = format!("put {key}");
    let response = self.send(&context, Method::PUT, url, &headers, Some(body)).await?;
    Self::ensure_success(&context, response).await?;
    Ok(ObjectMetadata {
      content_type: content_type.to_owned(),
      content_length: headers[1].1.parse().unwrap_or(0),
      last_modified_ms: crate::storage::now_ms(),
      checksum_crc32: Some(checksum),
    })
  }

  async fn get(&self, key: &str) -> Result<Option<(Vec<u8>, ObjectMetadata)>, StorageError> {
    normalize_storage_key(key)?;
    let url = GetObject::new(&self.bucket, Some(&self.credentials), key).sign(DEFAULT_PRESIGN_EXPIRES);
    let context = format!("get {key}");
    let response = self.send(&context, Method::GET, url, &[], None).await?;
    if response.status() == StatusCode::NOT_FOUND {
      return Ok(None);
    }
    let response = Self::ensure_success(&context, response).await?;
    let metadata = metadata_from_headers(response.headers());
    let body = response
      .bytes()
      .await
      .map_err(|err| request_error(&context, err.without_url()))?;
    Ok(Some((body.to_vec(), metadata)))
  }

  async fn head(&self, key: &str) -> Result<Option<ObjectMetadata>, StorageError> {
    normalize_storage_key(key)?;
    let url = HeadObject::new(&self.bucket, Some(&self.credentials), key).sign(DEFAULT_PRESIGN_EXPIRES);
    let context = format!("head {key}");
    let response = self.send(&context, Method::HEAD, url, &[], None).await?;
    if response.status() == StatusCode::NOT_FOUND {
      return Ok(None);
    }
    let response = Self::ensure_success(&context, response).await?;
    Ok(Some(metadata_from_headers(response.headers())))
  }

  async fn delete(&self, key: &str) -> Result<(), StorageError> {
    normalize_storage_key(key)?;
    let url = DeleteObject::new(&self.bucket, Some(&self.credentials), key).sign(DEFAULT_PRESIGN_EXPIRES);
    let context = format!("delete {key}");
    let response = self.send(&context, Method::DELETE, url, &[], None).await?;
    if response.status() == StatusCode::NOT_FOUND {
      return Ok(());
    }
    Self::ensure_success(&context, response).await?;
    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn s3_config_debug_redacts_secrets() {
    let config = S3Config {
      endpoint: None,
      region: "us-east-1".into(),
      bucket: "b".into(),
      access_key_id: "AKID".into(),
      secret_access_key: "super-secret-key".into(),
      session_token: Some("session-token-value".into()),
      force_path_style: false,
      request_timeout: None,
    };
    let debug = format!("{config:?}");
    assert!(debug.contains("AKID") && debug.contains("[REDACTED]"), "{debug}");
    for secret in ["super-secret-key", "session-token-value"] {
      assert!(!debug.contains(secret), "{debug}");
    }
  }
}
