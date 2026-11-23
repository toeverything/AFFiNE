//! Object storage backends for workspace blobs.
//!
//! [`LocalFsBlobStorage`] keeps the `v0.27.5` file-system layout
//! (`packages/backend/native/src/runtime/object_storage/fs.rs`):
//! `<root>/<bucket>/<key segments>` plus a `<object>.metadata.json` sidecar
//! (`contentType`, `contentLength`, `lastModified`, `checksumCRC32`), so both
//! server generations can share one storage directory.

use std::{
  path::{Path, PathBuf},
  time::{SystemTime, UNIX_EPOCH},
};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};

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
}

/// Stored object metadata (the reference `ObjectMetadata`).
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ObjectMetadata {
  pub content_type: String,
  pub content_length: i64,
  pub last_modified_ms: i64,
  pub checksum_crc32: Option<String>,
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

/// Whether a key segment could collide with the local storage's own files:
/// a `<object>.metadata.json` sidecar or a `<object>.tmp-<id>` partial write
/// (ASCII case-insensitive, for case-insensitive file systems).
pub fn is_reserved_segment(segment: &str) -> bool {
  let lower = segment.to_ascii_lowercase();
  lower.ends_with(METADATA_SUFFIX) || lower.contains(TEMPORARY_MARKER)
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

#[async_trait::async_trait]
pub trait BlobStorageBackend: Send + Sync + 'static {
  async fn put(&self, key: &str, body: Vec<u8>, content_type: &str) -> Result<ObjectMetadata, StorageError>;
  async fn get(&self, key: &str) -> Result<Option<(Vec<u8>, ObjectMetadata)>, StorageError>;
  async fn head(&self, key: &str) -> Result<Option<ObjectMetadata>, StorageError>;
  /// Deletes the object; a missing object is not an error.
  async fn delete(&self, key: &str) -> Result<(), StorageError>;
}

/// Local file-system storage under `<root>/<bucket>`.
#[derive(Clone, Debug)]
pub struct LocalFsBlobStorage {
  bucket_dir: PathBuf,
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

impl LocalFsBlobStorage {
  /// `root` may start with `~/` (the reference default `~/.affine/storage`).
  pub fn new(root: &str, bucket: &str) -> Result<Self, StorageError> {
    if bucket.is_empty() || normalize_storage_key(bucket)?.len() != 1 {
      return Err(StorageError::Config(format!("invalid bucket name `{bucket}`")));
    }
    let root = match root.strip_prefix("~/") {
      Some(rest) => std::env::var_os("HOME")
        .map(|home| PathBuf::from(home).join(rest))
        .ok_or_else(|| StorageError::Config("HOME is not set for a `~/` storage root".into()))?,
      None => PathBuf::from(root),
    };
    Ok(Self {
      bucket_dir: root.join(bucket),
    })
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
  tmp.push(format!("{TEMPORARY_MARKER}{}", uuid::Uuid::new_v4().simple()));
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

async fn blocking<T: Send + 'static>(
  f: impl FnOnce() -> Result<T, StorageError> + Send + 'static,
) -> Result<T, StorageError> {
  tokio::task::spawn_blocking(f)
    .await
    .map_err(|err| StorageError::Request {
      context: "local storage task".into(),
      message: err.to_string(),
    })?
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
    let sidecar = serde_json::to_vec(&FsBlobMetadata {
      content_type: metadata.content_type.clone(),
      content_length: metadata.content_length,
      last_modified: metadata.last_modified_ms,
      checksum_crc32: metadata.checksum_crc32.clone(),
    })
    .map_err(|err| StorageError::Metadata(err.to_string()))?;
    blocking(move || {
      if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(io("create object directory"))?;
      }
      write_atomically(&path, &body)?;
      write_atomically(&metadata_path(&path), &sidecar)
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
}
