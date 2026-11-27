//! Object storage backends for workspace blobs.
//!
//! [`LocalFsBlobStorage`] keeps the `v0.27.5` file-system layout
//! (`packages/backend/native/src/runtime/object_storage/fs.rs`):
//! `<root>/<bucket>/<key segments>` plus a `<object>.metadata.json` sidecar
//! (`contentType`, `contentLength`, `lastModified`, `checksumCRC32`), so both
//! server generations can share one storage directory.

use std::{
  collections::BTreeMap,
  path::{Path, PathBuf},
  sync::Arc,
  time::{SystemTime, UNIX_EPOCH},
};

use arc_swap::ArcSwap;
use base64::{
  Engine as _,
  engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac as _};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest as _, Sha256};

type HmacSha256 = Hmac<Sha256>;

pub const MULTIPART_PART_SIZE: i64 = 5 * 1024 * 1024;
pub const MULTIPART_THRESHOLD: i64 = 10 * 1024 * 1024;
pub const PROXY_UPLOAD_PATH: &str = "/api/storage/upload";
pub const PROXY_MULTIPART_PATH: &str = "/api/storage/multipart";

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
  #[error("invalid storage key: {0}")]
  InvalidKey(String),
  #[error("invalid storage configuration: {0}")]
  Config(String),
  #[error("storage io error ({context}): {source}")]
  Io {
    context: &'static str,
    #[source]
    source: std::io::Error,
  },
  #[error("storage metadata error: {0}")]
  Metadata(String),
  #[error("storage request failed ({context}): {message}")]
  Request { context: String, message: String },
  #[error("storage operation not supported: {0}")]
  Unsupported(String),
}

/// Stored object metadata (the reference `ObjectMetadata`).
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ObjectMetadata {
  pub content_type: String,
  pub content_length: i64,
  pub last_modified_ms: i64,
  pub checksum_crc32: Option<String>,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct StorageCapabilities {
  pub presign_put: bool,
  pub multipart_direct: bool,
  pub proxy_upload: bool,
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UploadUrlConfig {
  pub proxy_upload: bool,
  pub url_prefix: Option<String>,
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PresignedUpload {
  pub url: String,
  pub headers: BTreeMap<String, String>,
  pub expires_at: DateTime<Utc>,
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MultipartUploadInit {
  pub upload_id: String,
  pub expires_at: DateTime<Utc>,
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UploadedPart {
  pub part_number: i32,
  pub etag: String,
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StorageBackendIdentity {
  pub kind: String,
  pub bucket: String,
  pub endpoint: Option<String>,
}
fn proxy_token_mac(secret: &str, path: &str, fields: &[Value], expires_at: i64) -> HmacSha256 {
  let mut canonical = vec![json!("affine-storage-upload"), json!(1), json!("PUT"), json!(path)];
  canonical.extend_from_slice(fields);
  canonical.push(json!(expires_at));
  let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
  mac.update(&serde_json::to_vec(&canonical).unwrap_or_default());
  mac
}
pub fn sign_proxy_upload_token(secret: &str, path: &str, fields: &[Value], expires_at: i64) -> String {
  let bytes = proxy_token_mac(secret, path, fields, expires_at)
    .finalize()
    .into_bytes();
  URL_SAFE_NO_PAD.encode(bytes)
}
pub fn verify_proxy_upload_token(secret: &str, path: &str, fields: &[Value], expires_at: i64, token: &str) -> bool {
  let Ok(sig) = URL_SAFE_NO_PAD.decode(token) else {
    return false;
  };
  proxy_token_mac(secret, path, fields, expires_at)
    .verify_slice(&sig)
    .is_ok()
}

/// Base64 of the big-endian CRC32 (`x-amz-checksum-crc32` / `checksumCRC32`).
pub fn checksum_crc32_base64(body: &[u8]) -> String {
  STANDARD.encode(crc32fast::hash(body).to_be_bytes())
}

pub(crate) fn now_ms() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|elapsed| i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX))
    .unwrap_or(0)
}

const METADATA_SUFFIX: &str = ".metadata.json";
const TEMPORARY_MARKER: &str = ".tmp-";
const MULTIPART_ROOT_DIR: &str = ".multipart";

/// Whether a key segment could collide with the local storage's own metadata
/// sidecar (`<object>.metadata.json`, ASCII case-insensitive).
pub fn is_reserved_segment(segment: &str) -> bool {
  segment.to_ascii_lowercase().ends_with(METADATA_SUFFIX)
}

/// Reference `normalize_storage_key`: `\` counts as `/`, and empty, `.` and
/// `..` segments or a leading `/` are rejected; so are NUL bytes and
/// [reserved](is_reserved_segment) segments.
pub fn normalize_storage_key(key: &str) -> Result<Vec<String>, StorageError> {
  let normalized = key.replace('\\', "/");
  let segments: Vec<String> = normalized.split('/').map(str::to_owned).collect();
  if normalized.is_empty()
    || normalized.starts_with('/')
    || segments.iter().any(|segment| {
      segment.is_empty() || segment == "." || segment == ".." || segment.contains('\0') || is_reserved_segment(segment)
    })
  {
    return Err(StorageError::InvalidKey(key.to_owned()));
  }
  Ok(segments)
}

pub(crate) fn validate_multipart_parts(parts: &[UploadedPart]) -> Result<Vec<UploadedPart>, StorageError> {
  if parts.is_empty() || parts.len() > 10_000 {
    return Err(StorageError::Metadata("invalid multipart part count".into()));
  }
  let mut sorted = parts.to_vec();
  sorted.sort_by_key(|p| p.part_number);
  if sorted[0].part_number < 1
    || sorted.last().is_some_and(|p| p.part_number > 10_000)
    || sorted.windows(2).any(|w| w[0].part_number >= w[1].part_number)
  {
    return Err(StorageError::Metadata(
      "invalid or duplicate multipart part numbers".into(),
    ));
  }
  Ok(sorted)
}
pub(crate) fn object_too_large(key: &str, max_bytes: usize) -> StorageError {
  StorageError::Metadata(format!("object `{key}` exceeds size limit of {max_bytes} bytes"))
}

#[async_trait::async_trait]
pub trait BlobStorageBackend: Send + Sync + 'static {
  async fn put(&self, key: &str, body: Vec<u8>, content_type: &str) -> Result<ObjectMetadata, StorageError>;
  async fn get(&self, key: &str) -> Result<Option<(Vec<u8>, ObjectMetadata)>, StorageError>;
  async fn head(&self, key: &str) -> Result<Option<ObjectMetadata>, StorageError>;
  async fn delete(&self, key: &str) -> Result<(), StorageError>;

  /// Reads `key` and fails when the object holds more than `max_bytes`.
  async fn get_limited(&self, key: &str, max_bytes: usize) -> Result<Option<(Vec<u8>, ObjectMetadata)>, StorageError> {
    if let Some(meta) = self.head(key).await?
      && u64::try_from(meta.content_length).is_ok_and(|len| len > max_bytes as u64)
    {
      return Err(object_too_large(key, max_bytes));
    }
    let Some((body, meta)) = self.get(key).await? else {
      return Ok(None);
    };
    if body.len() > max_bytes {
      return Err(object_too_large(key, max_bytes));
    }
    Ok(Some((body, meta)))
  }

  /// Returns a signed download URL for `key`, or `None` when the backend
  /// cannot sign downloads.
  async fn presign_get(&self, _k: &str) -> Result<Option<PresignedUpload>, StorageError> {
    Ok(None)
  }

  fn capabilities(&self) -> StorageCapabilities {
    StorageCapabilities::default()
  }
  fn upload_url_config(&self) -> Option<UploadUrlConfig> {
    None
  }
  fn sign_upload_token(&self, _path: &str, _fields: &[Value], _expires_at: i64) -> Option<String> {
    None
  }
  fn verify_upload_token(&self, _path: &str, _fields: &[Value], _expires_at: i64, _token: &str) -> bool {
    false
  }
  async fn presign_put(&self, _k: &str, _ct: &str, _len: i64) -> Result<Option<PresignedUpload>, StorageError> {
    Ok(None)
  }
  async fn create_multipart_upload(&self, _k: &str, _ct: &str) -> Result<Option<MultipartUploadInit>, StorageError> {
    Ok(None)
  }
  async fn presign_upload_part(&self, _k: &str, _uid: &str, _pn: i32) -> Result<Option<PresignedUpload>, StorageError> {
    Ok(None)
  }
  async fn upload_part(&self, _k: &str, _uid: &str, _pn: i32, _b: Vec<u8>) -> Result<String, StorageError> {
    Err(StorageError::Unsupported("multipart upload part not supported".into()))
  }
  async fn list_multipart_parts(&self, _k: &str, _uid: &str) -> Result<Option<Vec<UploadedPart>>, StorageError> {
    Ok(None)
  }
  async fn complete_multipart_upload(
    &self,
    _k: &str,
    _uid: &str,
    _p: &[UploadedPart],
  ) -> Result<ObjectMetadata, StorageError> {
    Err(StorageError::Unsupported(
      "complete multipart upload not supported".into(),
    ))
  }
  async fn abort_multipart_upload(&self, _k: &str, _uid: &str) -> Result<bool, StorageError> {
    Ok(false)
  }
  async fn promote_object(&self, src: &str, dst: &str, ct: &str) -> Result<ObjectMetadata, StorageError> {
    let (body, _) = self
      .get(src)
      .await?
      .ok_or_else(|| StorageError::Metadata(format!("staging object `{src}` not found")))?;
    self.put(dst, body, ct).await
  }
  async fn list_prefix(
    &self,
    _pfx: &str,
    _after: Option<&str>,
    _lim: usize,
  ) -> Result<Vec<(String, Option<DateTime<Utc>>)>, StorageError> {
    Ok(Vec::new())
  }
  fn backend_identity(&self) -> StorageBackendIdentity {
    StorageBackendIdentity {
      kind: "custom".into(),
      bucket: "default".into(),
      endpoint: None,
    }
  }
}

pub struct DynamicBlobStorage {
  inner: ArcSwap<Arc<dyn BlobStorageBackend>>,
  reload_lock: tokio::sync::RwLock<()>,
}

impl DynamicBlobStorage {
  pub fn new(initial: Arc<dyn BlobStorageBackend>) -> Self {
    Self {
      inner: ArcSwap::from_pointee(initial),
      reload_lock: tokio::sync::RwLock::new(()),
    }
  }
  pub fn current(&self) -> Arc<dyn BlobStorageBackend> {
    Arc::clone(&self.inner.load())
  }
  pub async fn read_reload(&self) -> tokio::sync::RwLockReadGuard<'_, ()> {
    self.reload_lock.read().await
  }
  pub async fn write_reload(&self) -> tokio::sync::RwLockWriteGuard<'_, ()> {
    self.reload_lock.write().await
  }
  pub fn swap_backend(&self, next: Arc<dyn BlobStorageBackend>) {
    self.inner.store(Arc::new(next));
  }
}

#[async_trait::async_trait]
impl BlobStorageBackend for DynamicBlobStorage {
  async fn put(&self, key: &str, body: Vec<u8>, content_type: &str) -> Result<ObjectMetadata, StorageError> {
    self.current().put(key, body, content_type).await
  }
  async fn get(&self, key: &str) -> Result<Option<(Vec<u8>, ObjectMetadata)>, StorageError> {
    self.current().get(key).await
  }
  async fn head(&self, key: &str) -> Result<Option<ObjectMetadata>, StorageError> {
    self.current().head(key).await
  }
  async fn delete(&self, key: &str) -> Result<(), StorageError> {
    self.current().delete(key).await
  }
  async fn get_limited(&self, key: &str, max_bytes: usize) -> Result<Option<(Vec<u8>, ObjectMetadata)>, StorageError> {
    self.current().get_limited(key, max_bytes).await
  }
  async fn presign_get(&self, k: &str) -> Result<Option<PresignedUpload>, StorageError> {
    self.current().presign_get(k).await
  }
  fn capabilities(&self) -> StorageCapabilities {
    self.current().capabilities()
  }
  fn upload_url_config(&self) -> Option<UploadUrlConfig> {
    self.current().upload_url_config()
  }
  fn sign_upload_token(&self, path: &str, fields: &[Value], expires_at: i64) -> Option<String> {
    self.current().sign_upload_token(path, fields, expires_at)
  }
  fn verify_upload_token(&self, path: &str, fields: &[Value], expires_at: i64, token: &str) -> bool {
    self.current().verify_upload_token(path, fields, expires_at, token)
  }
  async fn presign_put(&self, k: &str, ct: &str, len: i64) -> Result<Option<PresignedUpload>, StorageError> {
    self.current().presign_put(k, ct, len).await
  }
  async fn create_multipart_upload(&self, k: &str, ct: &str) -> Result<Option<MultipartUploadInit>, StorageError> {
    self.current().create_multipart_upload(k, ct).await
  }
  async fn presign_upload_part(&self, k: &str, uid: &str, pn: i32) -> Result<Option<PresignedUpload>, StorageError> {
    self.current().presign_upload_part(k, uid, pn).await
  }
  async fn upload_part(&self, k: &str, uid: &str, pn: i32, b: Vec<u8>) -> Result<String, StorageError> {
    self.current().upload_part(k, uid, pn, b).await
  }
  async fn list_multipart_parts(&self, k: &str, uid: &str) -> Result<Option<Vec<UploadedPart>>, StorageError> {
    self.current().list_multipart_parts(k, uid).await
  }
  async fn complete_multipart_upload(
    &self,
    k: &str,
    uid: &str,
    p: &[UploadedPart],
  ) -> Result<ObjectMetadata, StorageError> {
    self.current().complete_multipart_upload(k, uid, p).await
  }
  async fn abort_multipart_upload(&self, k: &str, uid: &str) -> Result<bool, StorageError> {
    self.current().abort_multipart_upload(k, uid).await
  }
  async fn promote_object(&self, src: &str, dst: &str, ct: &str) -> Result<ObjectMetadata, StorageError> {
    self.current().promote_object(src, dst, ct).await
  }
  async fn list_prefix(
    &self,
    pfx: &str,
    after: Option<&str>,
    lim: usize,
  ) -> Result<Vec<(String, Option<DateTime<Utc>>)>, StorageError> {
    self.current().list_prefix(pfx, after, lim).await
  }
  fn backend_identity(&self) -> StorageBackendIdentity {
    self.current().backend_identity()
  }
}

/// Local file-system storage under `<root>/<bucket>`.
#[derive(Clone, Debug)]
pub struct LocalFsBlobStorage {
  bucket_dir: PathBuf,
  bucket_name: String,
  proxy_upload_secret: Option<String>,
  upload_url_prefix: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FsBlobMetadata {
  content_type: String,
  content_length: i64,
  last_modified: i64,
  #[serde(rename = "checksumCRC32")]
  checksum_crc32: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FsMultipartManifest {
  key: String,
  content_type: String,
  created_at_ms: i64,
}

pub(crate) fn resolve_bucket_dir(root: &str, bucket: &str) -> Result<PathBuf, StorageError> {
  if bucket.is_empty() || normalize_storage_key(bucket)?.len() != 1 {
    return Err(StorageError::Config(format!("invalid bucket name `{bucket}`")));
  }
  let base = match root.strip_prefix("~/") {
    Some(rest) => std::env::var_os("HOME")
      .map(|home| PathBuf::from(home).join(rest))
      .ok_or_else(|| StorageError::Config("HOME is not set for a `~/` storage root".into()))?,
    None => PathBuf::from(root),
  };
  Ok(base.join(bucket))
}

impl LocalFsBlobStorage {
  /// `root` may start with `~/` (the reference default `~/.affine/storage`).
  pub fn new(root: &str, bucket: &str) -> Result<Self, StorageError> {
    Ok(Self {
      bucket_dir: resolve_bucket_dir(root, bucket)?,
      bucket_name: bucket.to_owned(),
      proxy_upload_secret: None,
      upload_url_prefix: None,
    })
  }

  /// Enables server-proxied single and multipart uploads signed with `secret`.
  pub fn with_proxy_upload(mut self, secret: impl Into<String>, url_prefix: Option<String>) -> Self {
    let secret = secret.into();
    if !secret.is_empty() {
      self.proxy_upload_secret = Some(secret);
    }
    self.upload_url_prefix = url_prefix;
    self
  }

  pub fn bucket_dir(&self) -> &Path {
    &self.bucket_dir
  }

  fn object_path(&self, key: &str) -> Result<PathBuf, StorageError> {
    let mut path = self.bucket_dir.clone();
    for segment in normalize_storage_key(key)? {
      path.push(segment);
    }
    Ok(path)
  }

  fn multipart_dir(&self, upload_id: &str) -> Result<PathBuf, StorageError> {
    if upload_id.is_empty()
      || upload_id.len() > 128
      || !upload_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
      return Err(StorageError::InvalidKey(format!("invalid upload id `{upload_id}`")));
    }
    Ok(self.bucket_dir.join(MULTIPART_ROOT_DIR).join(upload_id))
  }
}

fn metadata_path(object: &Path) -> PathBuf {
  let mut name = object.as_os_str().to_owned();
  name.push(METADATA_SUFFIX);
  PathBuf::from(name)
}

fn io(context: &'static str) -> impl FnOnce(std::io::Error) -> StorageError {
  move |source| StorageError::Io { context, source }
}

/// Writes through a uniquely named sibling and renames it into place, so
/// readers never observe a partially written object or sidecar.
fn write_atomically(path: &Path, bytes: &[u8]) -> Result<(), StorageError> {
  let mut tmp = path.as_os_str().to_owned();
  tmp.push(format!(
    "{TEMPORARY_MARKER}{}{METADATA_SUFFIX}",
    uuid::Uuid::new_v4().simple()
  ));
  let tmp = PathBuf::from(tmp);
  std::fs::write(&tmp, bytes).map_err(io("write temporary object"))?;
  std::fs::rename(&tmp, path).map_err(|source| {
    let _ = std::fs::remove_file(&tmp);
    StorageError::Io {
      context: "rename object into place",
      source,
    }
  })
}

fn read_metadata(object: &Path) -> Result<Option<ObjectMetadata>, StorageError> {
  let raw = match std::fs::read(metadata_path(object)) {
    Ok(raw) => raw,
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
    Err(source) => {
      return Err(StorageError::Io {
        context: "read object metadata",
        source,
      });
    }
  };
  let parsed: FsBlobMetadata = serde_json::from_slice(&raw).map_err(|err| StorageError::Metadata(err.to_string()))?;
  Ok(Some(ObjectMetadata {
    content_type: parsed.content_type,
    content_length: parsed.content_length,
    last_modified_ms: parsed.last_modified,
    checksum_crc32: parsed.checksum_crc32,
  }))
}

fn remove_if_present(path: &Path, context: &'static str) -> Result<(), StorageError> {
  match std::fs::remove_file(path) {
    Ok(()) => Ok(()),
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
    Err(source) => Err(StorageError::Io { context, source }),
  }
}

fn collect_keys_bounded(
  root: &Path,
  dir: &Path,
  prefix: &str,
  after: Option<&str>,
  limit: usize,
  out: &mut Vec<(String, Option<DateTime<Utc>>)>,
) -> Result<(), StorageError> {
  if out.len() >= limit {
    return Ok(());
  }
  let entries = match std::fs::read_dir(dir) {
    Ok(e) => e,
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
    Err(e) => return Err(io("read storage directory")(e)),
  };
  let mut children = Vec::new();
  for entry in entries {
    let entry = entry.map_err(io("read storage entry"))?;
    let name = entry.file_name().to_string_lossy().into_owned();
    if name != MULTIPART_ROOT_DIR
      && !is_reserved_segment(&name)
      && let Ok(meta) = entry.metadata()
    {
      children.push((name, entry.path(), meta));
    }
  }
  children.sort_by(|a, b| a.0.cmp(&b.0));
  for (_, path, meta) in children {
    if out.len() >= limit {
      break;
    }
    let Ok(rel) = path.strip_prefix(root) else { continue };
    let rel_key = rel
      .components()
      .map(|c| c.as_os_str().to_string_lossy())
      .collect::<Vec<_>>()
      .join("/");
    if meta.is_dir() {
      let dp = format!("{rel_key}/");
      if prefix.is_empty() || dp.starts_with(prefix) || prefix.starts_with(&dp) {
        collect_keys_bounded(root, &path, prefix, after, limit, out)?;
      }
    } else if meta.is_file()
      && !rel_key.is_empty()
      && rel_key.starts_with(prefix)
      && !after.is_some_and(|c| rel_key.as_str() <= c)
    {
      out.push((rel_key, meta.modified().ok().map(DateTime::<Utc>::from)));
    }
  }
  Ok(())
}

async fn blocking<T: Send + 'static>(
  f: impl FnOnce() -> Result<T, StorageError> + Send + 'static,
) -> Result<T, StorageError> {
  tokio::task::spawn_blocking(f)
    .await
    .map_err(|e| StorageError::Request {
      context: "local storage task".into(),
      message: e.to_string(),
    })?
}

fn read_fs_manifest(dir: &Path, expected_key: &str) -> Result<FsMultipartManifest, StorageError> {
  let raw = std::fs::read(dir.join("manifest.json")).map_err(io("read multipart manifest"))?;
  let m: FsMultipartManifest = serde_json::from_slice(&raw).map_err(|e| StorageError::Metadata(e.to_string()))?;
  if m.key != expected_key {
    return Err(StorageError::InvalidKey("multipart key mismatch".into()));
  }
  Ok(m)
}

fn write_sidecar(path: &Path, m: &ObjectMetadata) -> Result<(), StorageError> {
  let raw = serde_json::to_vec(&FsBlobMetadata {
    content_type: m.content_type.clone(),
    content_length: m.content_length,
    last_modified: m.last_modified_ms,
    checksum_crc32: m.checksum_crc32.clone(),
  })
  .map_err(|e| StorageError::Metadata(e.to_string()))?;
  write_atomically(&metadata_path(path), &raw)
}

#[async_trait::async_trait]
impl BlobStorageBackend for LocalFsBlobStorage {
  async fn put(&self, key: &str, body: Vec<u8>, content_type: &str) -> Result<ObjectMetadata, StorageError> {
    let path = self.object_path(key)?;
    let metadata = ObjectMetadata {
      content_type: content_type.to_owned(),
      content_length: i64::try_from(body.len()).map_err(|_| StorageError::InvalidKey(key.to_owned()))?,
      last_modified_ms: now_ms(),
      checksum_crc32: Some(checksum_crc32_base64(&body)),
    };
    let meta_clone = metadata.clone();
    blocking(move || {
      if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(io("create object directory"))?;
      }
      write_atomically(&path, &body)?;
      write_sidecar(&path, &meta_clone)
    })
    .await?;
    Ok(metadata)
  }

  async fn get(&self, key: &str) -> Result<Option<(Vec<u8>, ObjectMetadata)>, StorageError> {
    let path = self.object_path(key)?;
    blocking(move || {
      let Some(metadata) = read_metadata(&path)? else {
        return Ok(None);
      };
      match std::fs::read(&path) {
        Ok(body) => Ok(Some((body, metadata))),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(source) => Err(StorageError::Io {
          context: "read object",
          source,
        }),
      }
    })
    .await
  }

  async fn get_limited(&self, key: &str, max_bytes: usize) -> Result<Option<(Vec<u8>, ObjectMetadata)>, StorageError> {
    let path = self.object_path(key)?;
    let key = key.to_owned();
    blocking(move || {
      use std::io::Read as _;
      let io_err = |source| StorageError::Io {
        context: "read object",
        source,
      };
      match std::fs::metadata(&path) {
        Ok(file_meta) if file_meta.len() > max_bytes as u64 => return Err(object_too_large(&key, max_bytes)),
        Ok(_) => {}
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(io_err(err)),
      }
      let Some(metadata) = read_metadata(&path)? else {
        return Ok(None);
      };
      let file = match std::fs::File::open(&path) {
        Ok(file) => file,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(io_err(err)),
      };
      let mut body = Vec::new();
      file
        .take((max_bytes as u64).saturating_add(1))
        .read_to_end(&mut body)
        .map_err(io_err)?;
      if body.len() > max_bytes {
        return Err(object_too_large(&key, max_bytes));
      }
      Ok(Some((body, metadata)))
    })
    .await
  }

  async fn head(&self, key: &str) -> Result<Option<ObjectMetadata>, StorageError> {
    let path = self.object_path(key)?;
    blocking(move || read_metadata(&path)).await
  }
  async fn delete(&self, key: &str) -> Result<(), StorageError> {
    let path = self.object_path(key)?;
    blocking(move || {
      remove_if_present(&path, "delete object")?;
      remove_if_present(&metadata_path(&path), "delete object metadata")
    })
    .await
  }
  fn capabilities(&self) -> StorageCapabilities {
    let proxy = self.proxy_upload_secret.is_some();
    StorageCapabilities {
      presign_put: proxy,
      multipart_direct: proxy,
      proxy_upload: proxy,
    }
  }
  fn upload_url_config(&self) -> Option<UploadUrlConfig> {
    self.proxy_upload_secret.as_ref().map(|_| UploadUrlConfig {
      proxy_upload: true,
      url_prefix: self.upload_url_prefix.clone(),
    })
  }
  fn sign_upload_token(&self, path: &str, fields: &[Value], expires_at: i64) -> Option<String> {
    self
      .proxy_upload_secret
      .as_deref()
      .map(|s| sign_proxy_upload_token(s, path, fields, expires_at))
  }
  fn verify_upload_token(&self, path: &str, fields: &[Value], expires_at: i64, token: &str) -> bool {
    self
      .proxy_upload_secret
      .as_deref()
      .is_some_and(|s| verify_proxy_upload_token(s, path, fields, expires_at, token))
  }
  async fn create_multipart_upload(&self, key: &str, ct: &str) -> Result<Option<MultipartUploadInit>, StorageError> {
    normalize_storage_key(key)?;
    let upload_id = format!("mp-{}", uuid::Uuid::new_v4().simple());
    let dir = self.multipart_dir(&upload_id)?;
    let manifest = serde_json::to_vec(&FsMultipartManifest {
      key: key.to_owned(),
      content_type: ct.to_owned(),
      created_at_ms: now_ms(),
    })
    .map_err(|err| StorageError::Metadata(err.to_string()))?;
    blocking(move || {
      std::fs::create_dir_all(&dir).map_err(io("create multipart directory"))?;
      write_atomically(&dir.join("manifest.json"), &manifest)
    })
    .await?;
    Ok(Some(MultipartUploadInit {
      upload_id,
      expires_at: Utc::now() + chrono::Duration::hours(24),
    }))
  }
  async fn upload_part(&self, key: &str, uid: &str, pn: i32, body: Vec<u8>) -> Result<String, StorageError> {
    if pn < 1 {
      return Err(StorageError::InvalidKey("part_number must be >= 1".into()));
    }
    normalize_storage_key(key)?;
    let (dir, key_owned) = (self.multipart_dir(uid)?, key.to_owned());
    let etag = format!("\"{}\"", hex::encode(Sha256::digest(&body)));
    let etag_meta = etag.clone();
    blocking(move || {
      read_fs_manifest(&dir, &key_owned)?;
      write_atomically(&dir.join(format!("part-{pn:06}.bin")), &body)?;
      write_atomically(&dir.join(format!("part-{pn:06}.etag")), etag_meta.as_bytes())
    })
    .await?;
    Ok(etag)
  }
  async fn list_multipart_parts(&self, key: &str, uid: &str) -> Result<Option<Vec<UploadedPart>>, StorageError> {
    normalize_storage_key(key)?;
    let (dir, key_owned) = (self.multipart_dir(uid)?, key.to_owned());
    blocking(move || {
      match read_fs_manifest(&dir, &key_owned) {
        Ok(_) => {}
        Err(StorageError::Io { source, .. }) if source.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(StorageError::InvalidKey(_)) => return Ok(None),
        Err(e) => return Err(e),
      }
      let mut parts = Vec::new();
      for entry in std::fs::read_dir(&dir).map_err(io("list multipart parts"))? {
        let e = entry.map_err(io("read multipart entry"))?;
        let name = e.file_name().to_string_lossy().into_owned();
        if let Some(pn) = name
          .strip_prefix("part-")
          .and_then(|s| s.strip_suffix(".etag"))
          .and_then(|s| s.parse().ok())
          && let Ok(etag) = std::fs::read_to_string(e.path())
        {
          parts.push(UploadedPart {
            part_number: pn,
            etag: etag.trim().to_owned(),
          });
        }
      }
      parts.sort_by_key(|p| p.part_number);
      Ok(Some(parts))
    })
    .await
  }
  async fn complete_multipart_upload(
    &self,
    k: &str,
    uid: &str,
    parts: &[UploadedPart],
  ) -> Result<ObjectMetadata, StorageError> {
    let sorted = validate_multipart_parts(parts)?;
    let (path, dir, key_owned) = (self.object_path(k)?, self.multipart_dir(uid)?, k.to_owned());
    blocking(move || {
      let manifest = read_fs_manifest(&dir, &key_owned)?;
      if let Some(p) = path.parent() {
        std::fs::create_dir_all(p).map_err(io("create object directory"))?;
      }
      let mut tmp = path.as_os_str().to_owned();
      tmp.push(format!(
        "{TEMPORARY_MARKER}{}{METADATA_SUFFIX}",
        uuid::Uuid::new_v4().simple()
      ));
      let tmp = PathBuf::from(tmp);
      let mut out = std::fs::File::create(&tmp).map_err(io("create temp multipart object"))?;
      let (mut hasher, mut total, mut buf) = (crc32fast::Hasher::new(), 0u64, [0u8; 64 * 1024]);
      for part in &sorted {
        let stored = std::fs::read_to_string(dir.join(format!("part-{:06}.etag", part.part_number)))
          .map_err(io("read part etag"))?;
        if stored.trim().trim_matches('"') != part.etag.trim().trim_matches('"') {
          let _ = std::fs::remove_file(&tmp);
          return Err(StorageError::Metadata(format!(
            "part {} etag mismatch",
            part.part_number
          )));
        }
        let mut f =
          std::fs::File::open(dir.join(format!("part-{:06}.bin", part.part_number))).map_err(io("open part body"))?;
        loop {
          let n = std::io::Read::read(&mut f, &mut buf).map_err(io("read part body"))?;
          if n == 0 {
            break;
          }
          std::io::Write::write_all(&mut out, &buf[..n]).map_err(io("write combined object"))?;
          hasher.update(&buf[..n]);
          total += n as u64;
        }
      }
      drop(out);
      let metadata = ObjectMetadata {
        content_type: manifest.content_type,
        content_length: i64::try_from(total).map_err(|_| StorageError::InvalidKey(key_owned.clone()))?,
        last_modified_ms: now_ms(),
        checksum_crc32: Some(STANDARD.encode(hasher.finalize().to_be_bytes())),
      };
      std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        io("rename combined object")(e)
      })?;
      write_sidecar(&path, &metadata)?;
      let _ = std::fs::remove_dir_all(&dir);
      Ok(metadata)
    })
    .await
  }
  async fn abort_multipart_upload(&self, _k: &str, uid: &str) -> Result<bool, StorageError> {
    let dir = self.multipart_dir(uid)?;
    blocking(move || match std::fs::remove_dir_all(&dir) {
      Ok(()) => Ok(true),
      Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
      Err(e) => Err(io("abort multipart upload")(e)),
    })
    .await
  }
  async fn promote_object(&self, src_key: &str, dst_key: &str, ct: &str) -> Result<ObjectMetadata, StorageError> {
    let (src, dst, ct) = (self.object_path(src_key)?, self.object_path(dst_key)?, ct.to_owned());
    blocking(move || {
      let mut meta =
        read_metadata(&src)?.ok_or_else(|| StorageError::Metadata("staging object metadata missing".into()))?;
      if !ct.is_empty() {
        meta.content_type = ct;
      }
      if let Some(p) = dst.parent() {
        std::fs::create_dir_all(p).map_err(io("create promote destination dir"))?;
      }
      std::fs::rename(&src, &dst).map_err(io("rename staging object"))?;
      write_sidecar(&dst, &meta)?;
      let _ = remove_if_present(&metadata_path(&src), "remove staging sidecar");
      Ok(meta)
    })
    .await
  }
  async fn list_prefix(
    &self,
    pfx: &str,
    after: Option<&str>,
    lim: usize,
  ) -> Result<Vec<(String, Option<DateTime<Utc>>)>, StorageError> {
    let (root, prefix, after) = (
      self.bucket_dir.clone(),
      pfx.replace('\\', "/"),
      after.map(str::to_owned),
    );
    blocking(move || {
      let mut out = Vec::new();
      collect_keys_bounded(&root, &root, &prefix, after.as_deref(), lim, &mut out)?;
      Ok(out)
    })
    .await
  }
  fn backend_identity(&self) -> StorageBackendIdentity {
    StorageBackendIdentity {
      kind: "fs".into(),
      bucket: self.bucket_name.clone(),
      endpoint: Some(self.bucket_dir.to_string_lossy().into_owned()),
    }
  }
}
