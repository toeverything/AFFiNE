use std::{
  collections::{HashMap, hash_map::DefaultHasher},
  hash::{Hash, Hasher},
  num::NonZeroUsize,
  path::{Path, PathBuf},
  sync::Mutex,
};

use lru::LruCache;

pub(crate) const MOBILE_BLOB_INLINE_THRESHOLD_BYTES: usize = 1024 * 1024;
const MOBILE_BLOB_CACHE_CAPACITY: usize = 32;
const MOBILE_BLOB_CACHE_DIR: &str = "nbstore-blob-cache";
pub(crate) const MOBILE_BLOB_FILE_PREFIX: &str = "__AFFINE_BLOB_FILE__:";
pub(crate) const MOBILE_DOC_FILE_PREFIX: &str = "__AFFINE_DOC_FILE__:";

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
  workspace_dirs: Mutex<HashMap<String, PathBuf>>,
  blob_entries: Mutex<LruCache<String, MobileBlobCacheEntry>>,
  doc_entries: Mutex<LruCache<String, String>>,
}

impl MobileBlobCache {
  pub(crate) fn new() -> Self {
    Self {
      workspace_dirs: Mutex::new(HashMap::new()),
      blob_entries: Mutex::new(LruCache::new(
        NonZeroUsize::new(MOBILE_BLOB_CACHE_CAPACITY).expect("cache capacity is non-zero"),
      )),
      doc_entries: Mutex::new(LruCache::new(
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
      .lock()
      .expect("workspace cache lock poisoned")
      .insert(universal_id.to_string(), cache_dir);
    Ok(())
  }

  pub(crate) fn get_blob(&self, universal_id: &str, key: &str) -> Option<crate::Blob> {
    let cache_key = Self::cache_key(universal_id, key);
    let mut entries = self.blob_entries.lock().expect("blob cache lock poisoned");

    if let Some(entry) = entries.get(&cache_key) {
      if Path::new(&entry.path).exists() {
        return Some(entry.to_blob());
      }
    }

    if let Some(entry) = entries.pop(&cache_key) {
      Self::delete_blob_file(&entry.path);
    }

    None
  }

  pub(crate) fn cache_blob(&self, universal_id: &str, blob: &affine_nbstore::Blob) -> std::io::Result<crate::Blob> {
    let cache_key = Self::cache_key(universal_id, &blob.key);
    let cache_dir = self.resolve_cache_dir(universal_id);
    std::fs::create_dir_all(&cache_dir)?;

    let file_path = Self::blob_file_path(&cache_dir, &cache_key);
    std::fs::write(&file_path, &blob.data)?;

    let entry = MobileBlobCacheEntry {
      key: blob.key.clone(),
      path: file_path.to_string_lossy().into_owned(),
      mime: blob.mime.clone(),
      size: blob.size,
      created_at: blob.created_at.and_utc().timestamp_millis(),
    };

    let mut entries = self.blob_entries.lock().expect("blob cache lock poisoned");
    if let Some((_previous_key, previous)) = entries.push(cache_key, entry.clone()) {
      if previous.path != entry.path {
        Self::delete_blob_file(&previous.path);
      }
    }

    Ok(entry.to_blob())
  }

  pub(crate) fn cache_doc_bin(
    &self,
    universal_id: &str,
    doc_id: &str,
    timestamp: i64,
    data: &[u8],
  ) -> std::io::Result<String> {
    let cache_key = Self::cache_key(universal_id, &format!("doc\u{1f}{doc_id}\u{1f}{timestamp}"));
    let cache_dir = self.resolve_cache_dir(universal_id);
    std::fs::create_dir_all(&cache_dir)?;

    let file_path = Self::doc_file_path(&cache_dir, &cache_key);
    std::fs::write(&file_path, data)?;

    let path = file_path.to_string_lossy().into_owned();
    let mut entries = self.doc_entries.lock().expect("doc cache lock poisoned");
    if let Some((_previous_key, previous_path)) = entries.push(cache_key, path.clone())
      && previous_path != path
    {
      Self::delete_blob_file(&previous_path);
    }

    Ok(format!("{MOBILE_DOC_FILE_PREFIX}{path}"))
  }

  pub(crate) fn invalidate_blob(&self, universal_id: &str, key: &str) {
    let cache_key = Self::cache_key(universal_id, key);
    if let Some(entry) = self
      .blob_entries
      .lock()
      .expect("blob cache lock poisoned")
      .pop(&cache_key)
    {
      Self::delete_blob_file(&entry.path);
    }
  }

  pub(crate) fn invalidate_workspace(&self, universal_id: &str) {
    let prefix = format!("{universal_id}\u{1f}");

    let mut blob_entries = self.blob_entries.lock().expect("blob cache lock poisoned");
    let keys = blob_entries
      .iter()
      .filter_map(|(key, _)| key.starts_with(&prefix).then_some(key.clone()))
      .collect::<Vec<_>>();

    for key in keys {
      if let Some(entry) = blob_entries.pop(&key) {
        Self::delete_blob_file(&entry.path);
      }
    }

    let mut doc_entries = self.doc_entries.lock().expect("doc cache lock poisoned");
    let doc_keys = doc_entries
      .iter()
      .filter_map(|(key, _)| key.starts_with(&prefix).then_some(key.clone()))
      .collect::<Vec<_>>();
    for key in doc_keys {
      if let Some(path) = doc_entries.pop(&key) {
        Self::delete_blob_file(&path);
      }
    }

    self
      .workspace_dirs
      .lock()
      .expect("workspace cache lock poisoned")
      .remove(universal_id);
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

  fn resolve_cache_dir(&self, universal_id: &str) -> PathBuf {
    let mut workspace_dirs = self.workspace_dirs.lock().expect("workspace cache lock poisoned");
    workspace_dirs
      .entry(universal_id.to_string())
      .or_insert_with(|| Self::fallback_temp_cache_dir(universal_id))
      .clone()
  }

  fn blob_file_path(cache_dir: &Path, cache_key: &str) -> PathBuf {
    let mut hasher = DefaultHasher::new();
    cache_key.hash(&mut hasher);
    cache_dir.join(format!("{:016x}.blob", hasher.finish()))
  }

  fn doc_file_path(cache_dir: &Path, cache_key: &str) -> PathBuf {
    let mut hasher = DefaultHasher::new();
    cache_key.hash(&mut hasher);
    cache_dir.join(format!("{:016x}.docbin", hasher.finish()))
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
  value.starts_with(MOBILE_BLOB_FILE_PREFIX) || value.starts_with(MOBILE_DOC_FILE_PREFIX)
}

pub(crate) fn read_mobile_binary_file(value: &str) -> std::io::Result<Vec<u8>> {
  let path = value
    .strip_prefix(MOBILE_BLOB_FILE_PREFIX)
    .or_else(|| value.strip_prefix(MOBILE_DOC_FILE_PREFIX))
    .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "invalid mobile file token"))?;
  std::fs::read(path)
}
