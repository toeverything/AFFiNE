use std::{
  collections::{HashMap, hash_map::DefaultHasher},
  hash::{Hash, Hasher},
  num::NonZeroUsize,
  path::{Path, PathBuf},
  sync::{Mutex, RwLock},
};

use affine_nbstore::Blob as NbBlob;
use lru::LruCache;

pub(crate) const MOBILE_PAYLOAD_INLINE_THRESHOLD_BYTES: usize = 1024 * 1024;
const MOBILE_BLOB_MAX_READ_BYTES: u64 = 64 * 1024 * 1024;
const MOBILE_BLOB_CACHE_CAPACITY: usize = 32;
const MOBILE_BLOB_CACHE_DIR: &str = "nbstore-blob-cache";
pub(crate) const MOBILE_BLOB_FILE_PREFIX: &str = "__AFFINE_BLOB_FILE__:";

pub(crate) fn should_cache_payload_as_file(payload_len: usize) -> bool {
  payload_len >= MOBILE_PAYLOAD_INLINE_THRESHOLD_BYTES
}

#[derive(Clone)]
struct MobileBlobCacheEntry {
  key: String,
  path: String,
  mime: String,
  size: i64,
  created_at: i64,
}

impl MobileBlobCacheEntry {
  fn to_blob(&self) -> crate::Blob {
    crate::Blob {
      key: self.key.clone(),
      data: format!("{MOBILE_BLOB_FILE_PREFIX}{}", self.path),
      mime: self.mime.clone(),
      size: self.size,
      created_at: self.created_at,
    }
  }
}

pub(crate) struct MobileBlobCache {
  workspace_dirs: RwLock<HashMap<String, PathBuf>>,
  blob_entries: Mutex<LruCache<String, MobileBlobCacheEntry>>,
}

impl MobileBlobCache {
  pub(crate) fn new() -> Self {
    Self {
      workspace_dirs: RwLock::new(HashMap::new()),
      blob_entries: Mutex::new(LruCache::new(
        NonZeroUsize::new(MOBILE_BLOB_CACHE_CAPACITY).expect("cache capacity is non-zero"),
      )),
    }
  }

  pub(crate) fn register_workspace(&self, universal_id: &str, database_path: &str) -> std::io::Result<()> {
    let cache_dir = Self::system_cache_dir(database_path, universal_id);

    std::fs::create_dir_all(&cache_dir)?;
    Self::cleanup_cache_dir(&cache_dir)?;
    self
      .workspace_dirs
      .write()
      .expect("workspace cache lock poisoned")
      .insert(universal_id.to_string(), cache_dir);
    Ok(())
  }

  pub(crate) fn get_blob(&self, universal_id: &str, key: &str) -> Option<crate::Blob> {
    let cache_key = Self::cache_key(universal_id, key);
    let mut stale_path = None;
    {
      let mut blob_entries = self.blob_entries.lock().expect("blob cache lock poisoned");
      if let Some(entry) = blob_entries.get(&cache_key).cloned() {
        if Path::new(&entry.path).exists() {
          return Some(entry.to_blob());
        }
        stale_path = blob_entries.pop(&cache_key).map(|removed| removed.path);
      }
    }

    if let Some(path) = stale_path {
      Self::delete_blob_file(&path);
    }

    None
  }

  pub(crate) fn cache_blob(&self, universal_id: &str, blob: &NbBlob) -> std::io::Result<crate::Blob> {
    let cache_key = Self::cache_key(universal_id, &blob.key);
    let cache_dir = self.get_or_create_cache_dir(universal_id)?;

    let file_path = Self::hashed_file_path(&cache_dir, &cache_key, "blob");
    std::fs::write(&file_path, &blob.data)?;

    let entry = MobileBlobCacheEntry {
      key: blob.key.clone(),
      path: file_path.to_string_lossy().into_owned(),
      mime: blob.mime.clone(),
      size: blob.size,
      created_at: blob.created_at.and_utc().timestamp_millis(),
    };

    let previous_path = {
      self
        .blob_entries
        .lock()
        .expect("blob cache lock poisoned")
        .push(cache_key, entry.clone())
        .and_then(|(_previous_key, previous)| (previous.path != entry.path).then_some(previous.path))
    };
    if let Some(previous_path) = previous_path {
      Self::delete_blob_file(&previous_path);
    }

    Ok(entry.to_blob())
  }

  pub(crate) fn invalidate_blob(&self, universal_id: &str, key: &str) {
    let cache_key = Self::cache_key(universal_id, key);
    let removed_path = self
      .blob_entries
      .lock()
      .expect("blob cache lock poisoned")
      .pop(&cache_key)
      .map(|entry| entry.path);
    if let Some(path) = removed_path {
      Self::delete_blob_file(&path);
    }
  }

  pub(crate) fn clear_workspace_cache(&self, universal_id: &str) {
    self.evict_workspace_entries(universal_id);

    let cache_dir = {
      self
        .workspace_dirs
        .read()
        .expect("workspace cache lock poisoned")
        .get(universal_id)
        .cloned()
    };
    if let Some(cache_dir) = cache_dir {
      let _ = Self::cleanup_cache_dir(&cache_dir);
    }
  }

  pub(crate) fn invalidate_workspace(&self, universal_id: &str) {
    self.evict_workspace_entries(universal_id);

    if let Some(cache_dir) = self
      .workspace_dirs
      .write()
      .expect("workspace cache lock poisoned")
      .remove(universal_id)
    {
      let _ = std::fs::remove_dir_all(&cache_dir);
      if let Some(parent) = cache_dir.parent() {
        let _ = std::fs::remove_dir(parent);
      }
    }
  }

  fn evict_workspace_entries(&self, universal_id: &str) {
    let prefix = format!("{universal_id}\u{1f}");

    let removed_blob_paths = {
      let mut blob_entries = self.blob_entries.lock().expect("blob cache lock poisoned");
      let keys = blob_entries
        .iter()
        .filter_map(|(key, _)| key.starts_with(&prefix).then_some(key.clone()))
        .collect::<Vec<_>>();
      keys
        .into_iter()
        .filter_map(|key| blob_entries.pop(&key).map(|entry| entry.path))
        .collect::<Vec<_>>()
    };

    for path in removed_blob_paths {
      Self::delete_blob_file(&path);
    }
  }

  fn cache_key(universal_id: &str, key: &str) -> String {
    format!("{universal_id}\u{1f}{key}")
  }

  #[cfg(target_os = "android")]
  fn system_cache_dir(database_path: &str, universal_id: &str) -> PathBuf {
    // Android DB lives in "<app>/files/..."; cache should live in
    // "<app>/cache/...".
    let mut current = Path::new(database_path).parent();
    while let Some(path) = current {
      if path.file_name().and_then(|n| n.to_str()) == Some("files") {
        if let Some(app_root) = path.parent() {
          return app_root
            .join("cache")
            .join(MOBILE_BLOB_CACHE_DIR)
            .join(Self::workspace_bucket(universal_id));
        }
      }
      current = path.parent();
    }
    Self::fallback_temp_cache_dir(universal_id)
  }

  #[cfg(target_os = "ios")]
  fn system_cache_dir(database_path: &str, universal_id: &str) -> PathBuf {
    // iOS DB lives in ".../Documents/..."; cache should live in
    // ".../Library/Caches/...".
    let mut current = Path::new(database_path).parent();
    while let Some(path) = current {
      if path.file_name().and_then(|n| n.to_str()) == Some("Documents") {
        if let Some(container_root) = path.parent() {
          return container_root
            .join("Library")
            .join("Caches")
            .join(MOBILE_BLOB_CACHE_DIR)
            .join(Self::workspace_bucket(universal_id));
        }
      }
      current = path.parent();
    }
    Self::fallback_temp_cache_dir(universal_id)
  }

  #[cfg(not(any(target_os = "android", target_os = "ios")))]
  fn system_cache_dir(_database_path: &str, universal_id: &str) -> PathBuf {
    Self::fallback_temp_cache_dir(universal_id)
  }

  fn fallback_temp_cache_dir(universal_id: &str) -> PathBuf {
    std::env::temp_dir()
      .join(MOBILE_BLOB_CACHE_DIR)
      .join(Self::workspace_bucket(universal_id))
  }

  fn workspace_bucket(universal_id: &str) -> String {
    let mut hasher = DefaultHasher::new();
    universal_id.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
  }

  fn get_or_create_cache_dir(&self, universal_id: &str) -> std::io::Result<PathBuf> {
    let cache_dir = self
      .workspace_dirs
      .write()
      .expect("workspace cache lock poisoned")
      .entry(universal_id.to_string())
      .or_insert_with(|| Self::fallback_temp_cache_dir(universal_id))
      .clone();
    std::fs::create_dir_all(&cache_dir)?;
    Ok(cache_dir)
  }

  fn hashed_file_path(cache_dir: &Path, cache_key: &str, extension: &str) -> PathBuf {
    let mut hasher = DefaultHasher::new();
    cache_key.hash(&mut hasher);
    cache_dir.join(format!("{:016x}.{extension}", hasher.finish()))
  }

  fn delete_blob_file(path: &str) {
    let _ = std::fs::remove_file(path);
  }

  fn cleanup_cache_dir(cache_dir: &Path) -> std::io::Result<()> {
    for entry in std::fs::read_dir(cache_dir)? {
      let entry = entry?;
      if entry.path().is_file() {
        let _ = std::fs::remove_file(entry.path());
      }
    }
    Ok(())
  }
}

pub(crate) fn is_mobile_binary_file_token(value: &str) -> bool {
  value.starts_with(MOBILE_BLOB_FILE_PREFIX)
}

impl MobileBlobCache {
  pub(crate) fn read_binary_file(&self, universal_id: &str, value: &str) -> std::io::Result<Vec<u8>> {
    let path = value
      .strip_prefix(MOBILE_BLOB_FILE_PREFIX)
      .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "invalid mobile file token"))?;

    let path = path.strip_prefix("file://").unwrap_or(path);
    let canonical = std::fs::canonicalize(path)?;
    let workspace_dir = {
      self
        .workspace_dirs
        .read()
        .expect("workspace cache lock poisoned")
        .get(universal_id)
        .cloned()
    }
    .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "workspace cache directory not registered"))?;
    let workspace_dir = std::fs::canonicalize(workspace_dir)?;

    if !is_valid_mobile_cache_path(&canonical, &workspace_dir) {
      return Err(std::io::Error::new(
        std::io::ErrorKind::PermissionDenied,
        "mobile file token points outside the workspace cache directory",
      ));
    }

    let metadata = std::fs::metadata(&canonical)?;
    if !metadata.is_file() {
      return Err(std::io::Error::new(
        std::io::ErrorKind::InvalidInput,
        "mobile file token does not resolve to a file",
      ));
    }
    if metadata.len() > MOBILE_BLOB_MAX_READ_BYTES {
      return Err(std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        format!(
          "mobile file token exceeds max size: {} > {}",
          metadata.len(),
          MOBILE_BLOB_MAX_READ_BYTES
        ),
      ));
    }

    std::fs::read(canonical)
  }
}

fn is_valid_mobile_cache_path(path: &Path, workspace_dir: &Path) -> bool {
  if !path.starts_with(workspace_dir) {
    return false;
  }

  let Ok(relative) = path.strip_prefix(workspace_dir) else {
    return false;
  };
  let mut components = relative.components();
  let Some(std::path::Component::Normal(file_name)) = components.next() else {
    return false;
  };
  if components.next().is_some() {
    return false;
  }

  let Some(file_name) = file_name.to_str() else {
    return false;
  };
  let Some((stem, extension)) = file_name.rsplit_once('.') else {
    return false;
  };
  if extension != "blob" {
    return false;
  }
  stem.len() == 16 && stem.chars().all(|c| c.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests;
