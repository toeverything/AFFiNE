use std::{
  collections::{HashMap, hash_map::DefaultHasher},
  hash::{Hash, Hasher},
  num::NonZeroUsize,
  path::{Path, PathBuf},
  sync::Mutex,
};

use lru::LruCache;

pub(crate) const MOBILE_BLOB_INLINE_THRESHOLD_BYTES: usize = 1024 * 1024;
const MOBILE_BLOB_MAX_READ_BYTES: u64 = 64 * 1024 * 1024;
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
    let cache_dir = self.ensure_cache_dir(universal_id)?;

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
    let cache_dir = self.ensure_cache_dir(universal_id)?;

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

  pub(crate) fn clear_workspace_cache(&self, universal_id: &str) {
    self.evict_workspace_entries(universal_id);

    let cache_dir = {
      self
        .workspace_dirs
        .lock()
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
      .lock()
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

  fn ensure_cache_dir(&self, universal_id: &str) -> std::io::Result<PathBuf> {
    let cache_dir = self.resolve_cache_dir(universal_id);
    std::fs::create_dir_all(&cache_dir)?;
    Ok(cache_dir)
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

impl MobileBlobCache {
  pub(crate) fn read_binary_file(&self, universal_id: &str, value: &str) -> std::io::Result<Vec<u8>> {
    let path = value
      .strip_prefix(MOBILE_BLOB_FILE_PREFIX)
      .or_else(|| value.strip_prefix(MOBILE_DOC_FILE_PREFIX))
      .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "invalid mobile file token"))?;

    let path = path.strip_prefix("file://").unwrap_or(path);
    let canonical = std::fs::canonicalize(path)?;
    let workspace_dir = {
      self
        .workspace_dirs
        .lock()
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
  if extension != "blob" && extension != "docbin" {
    return false;
  }
  stem.len() == 16 && stem.chars().all(|c| c.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
  #[cfg(unix)]
  use std::os::unix::fs::{PermissionsExt, symlink};
  use std::{
    fs,
    io::ErrorKind,
    path::PathBuf,
    sync::{
      Arc,
      atomic::{AtomicU64, Ordering},
    },
    thread,
    time::{SystemTime, UNIX_EPOCH},
  };

  use super::*;

  static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

  fn unique_id(prefix: &str) -> String {
    let counter = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
    let now = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("system clock before unix epoch")
      .as_nanos();
    format!("{prefix}-{now}-{counter}")
  }

  fn build_blob(key: &str, data: Vec<u8>) -> affine_nbstore::Blob {
    affine_nbstore::Blob {
      key: key.to_string(),
      data: data.clone(),
      mime: "application/octet-stream".to_string(),
      size: data.len() as i64,
      created_at: chrono::DateTime::<chrono::Utc>::from_timestamp_millis(0)
        .expect("valid timestamp")
        .naive_utc(),
    }
  }

  fn workspace_dir(cache: &MobileBlobCache, universal_id: &str) -> PathBuf {
    cache
      .workspace_dirs
      .lock()
      .expect("workspace cache lock poisoned")
      .get(universal_id)
      .cloned()
      .expect("workspace should be registered")
  }

  fn token_path(token: &str) -> PathBuf {
    token
      .strip_prefix(MOBILE_BLOB_FILE_PREFIX)
      .or_else(|| token.strip_prefix(MOBILE_DOC_FILE_PREFIX))
      .map(PathBuf::from)
      .expect("token should contain file path")
  }

  fn setup_cache(prefix: &str) -> (MobileBlobCache, String, PathBuf) {
    let cache = MobileBlobCache::new();
    let universal_id = unique_id(prefix);
    let db_path = std::env::temp_dir()
      .join("affine-mobile-cache-tests")
      .join(unique_id("db"))
      .join("workspace.sqlite");
    if let Some(parent) = db_path.parent() {
      fs::create_dir_all(parent).expect("create test db parent");
    }
    cache
      .register_workspace(&universal_id, db_path.to_string_lossy().as_ref())
      .expect("register workspace should succeed");
    let workspace = workspace_dir(&cache, &universal_id);
    (cache, universal_id, workspace)
  }

  #[test]
  fn read_binary_file_rejects_path_traversal_and_malformed_name() {
    let (cache, universal_id, workspace) = setup_cache("path-validation");

    let outside_name = unique_id("outside");
    let outside_dir = workspace
      .parent()
      .expect("workspace should have parent")
      .join(&outside_name);
    fs::create_dir_all(&outside_dir).expect("create outside dir");
    let outside_file = outside_dir.join("1234567890abcdef.blob");
    fs::write(&outside_file, b"outside-data").expect("write outside file");

    let traversal = workspace.join(format!("../{outside_name}/1234567890abcdef.blob"));
    let traversal_token = format!("{MOBILE_BLOB_FILE_PREFIX}{}", traversal.display());
    let traversal_err = cache
      .read_binary_file(&universal_id, &traversal_token)
      .expect_err("path traversal should be rejected");
    assert_eq!(traversal_err.kind(), ErrorKind::PermissionDenied);

    let malformed = workspace.join("invalid-name.blob");
    fs::write(&malformed, b"bad").expect("write malformed file");
    let malformed_token = format!("{MOBILE_BLOB_FILE_PREFIX}{}", malformed.display());
    let malformed_err = cache
      .read_binary_file(&universal_id, &malformed_token)
      .expect_err("malformed cache path should be rejected");
    assert_eq!(malformed_err.kind(), ErrorKind::PermissionDenied);

    cache.invalidate_workspace(&universal_id);
    let _ = fs::remove_dir_all(outside_dir);
  }

  #[cfg(unix)]
  #[test]
  fn read_binary_file_rejects_symlink_escape() {
    let (cache, universal_id, workspace) = setup_cache("symlink");

    let outside_dir = workspace
      .parent()
      .expect("workspace should have parent")
      .join(unique_id("symlink-outside"));
    fs::create_dir_all(&outside_dir).expect("create outside dir");
    let outside_file = outside_dir.join("1234567890abcdef.blob");
    fs::write(&outside_file, b"outside-data").expect("write outside file");

    let symlink_path = workspace.join("aaaaaaaaaaaaaaaa.blob");
    symlink(&outside_file, &symlink_path).expect("create symlink");

    let token = format!("{MOBILE_BLOB_FILE_PREFIX}{}", symlink_path.display());
    let err = cache
      .read_binary_file(&universal_id, &token)
      .expect_err("symlink escaping cache dir should be rejected");
    assert_eq!(err.kind(), ErrorKind::PermissionDenied);

    cache.invalidate_workspace(&universal_id);
    let _ = fs::remove_dir_all(outside_dir);
  }

  #[test]
  fn cache_blob_evicts_lru_entry_and_deletes_file() {
    let (cache, universal_id, _workspace) = setup_cache("lru-eviction");
    let mut first_path = None;

    for i in 0..=MOBILE_BLOB_CACHE_CAPACITY {
      let key = format!("blob-{i}");
      let blob = build_blob(&key, vec![i as u8]);
      let cached = cache.cache_blob(&universal_id, &blob).expect("cache blob");
      if i == 0 {
        first_path = Some(token_path(&cached.data));
      }
    }

    let first_path = first_path.expect("first path should exist");
    assert!(!first_path.exists(), "evicted blob file should be deleted");
    assert!(cache.get_blob(&universal_id, "blob-0").is_none());
    assert!(cache.get_blob(&universal_id, "blob-1").is_some());

    cache.invalidate_workspace(&universal_id);
  }

  #[test]
  fn invalidate_workspace_removes_cached_files_and_workspace_dir() {
    let (cache, universal_id, workspace) = setup_cache("invalidate");

    let cached_blob = cache
      .cache_blob(&universal_id, &build_blob("blob", vec![1, 2, 3]))
      .expect("cache blob");
    let blob_path = token_path(&cached_blob.data);
    let doc_token = cache
      .cache_doc_bin(&universal_id, "doc", 123, b"doc-bytes")
      .expect("cache doc bin");
    let doc_path = token_path(&doc_token);
    assert!(blob_path.exists());
    assert!(doc_path.exists());

    cache.invalidate_workspace(&universal_id);

    assert!(!blob_path.exists());
    assert!(!doc_path.exists());
    assert!(!workspace.exists());
    assert!(
      !cache
        .workspace_dirs
        .lock()
        .expect("workspace cache lock poisoned")
        .contains_key(&universal_id)
    );
  }

  #[test]
  fn clear_workspace_cache_removes_cached_files_and_keeps_workspace_dir() {
    let (cache, universal_id, workspace) = setup_cache("clear");

    let cached_blob = cache
      .cache_blob(&universal_id, &build_blob("blob", vec![1, 2, 3]))
      .expect("cache blob");
    let blob_path = token_path(&cached_blob.data);
    let doc_token = cache
      .cache_doc_bin(&universal_id, "doc", 123, b"doc-bytes")
      .expect("cache doc bin");
    let doc_path = token_path(&doc_token);
    assert!(blob_path.exists());
    assert!(doc_path.exists());

    cache.clear_workspace_cache(&universal_id);

    assert!(!blob_path.exists());
    assert!(!doc_path.exists());
    assert!(workspace.exists());
    assert!(
      cache
        .workspace_dirs
        .lock()
        .expect("workspace cache lock poisoned")
        .contains_key(&universal_id)
    );

    let recached_blob = cache
      .cache_blob(&universal_id, &build_blob("blob-2", vec![7, 8, 9]))
      .expect("cache blob after clearing workspace");
    assert!(token_path(&recached_blob.data).exists());

    cache.invalidate_workspace(&universal_id);
  }

  #[test]
  fn read_binary_file_returns_not_found_for_missing_file() {
    let (cache, universal_id, _workspace) = setup_cache("missing-file");

    let cached_blob = cache
      .cache_blob(&universal_id, &build_blob("blob", vec![9, 8, 7]))
      .expect("cache blob");
    let path = token_path(&cached_blob.data);
    fs::remove_file(&path).expect("remove cached file");

    let err = cache
      .read_binary_file(&universal_id, &cached_blob.data)
      .expect_err("missing file should error");
    assert_eq!(err.kind(), ErrorKind::NotFound);

    cache.invalidate_workspace(&universal_id);
  }

  #[cfg(unix)]
  #[test]
  fn read_binary_file_returns_permission_denied_for_unreadable_file() {
    let (cache, universal_id, workspace) = setup_cache("permissions");

    let file_path = workspace.join("1234567890abcdef.blob");
    fs::write(&file_path, b"secret").expect("write file");

    let mut permissions = fs::metadata(&file_path).expect("read metadata").permissions();
    permissions.set_mode(0o000);
    fs::set_permissions(&file_path, permissions).expect("set restrictive permissions");

    let token = format!("{MOBILE_BLOB_FILE_PREFIX}{}", file_path.display());
    let err = cache
      .read_binary_file(&universal_id, &token)
      .expect_err("unreadable file should error");
    assert_eq!(err.kind(), ErrorKind::PermissionDenied);

    let mut restore = fs::metadata(&file_path).expect("read metadata").permissions();
    restore.set_mode(0o600);
    let _ = fs::set_permissions(&file_path, restore);
    cache.invalidate_workspace(&universal_id);
  }

  #[test]
  fn concurrent_cache_and_read_is_consistent() {
    let cache = Arc::new(MobileBlobCache::new());
    let universal_id = Arc::new(unique_id("concurrent"));
    cache
      .register_workspace(universal_id.as_str(), ":memory:")
      .expect("register workspace");

    let workers = 8;
    let iterations = 24;
    let mut handles = Vec::with_capacity(workers);

    for worker in 0..workers {
      let cache = Arc::clone(&cache);
      let universal_id = Arc::clone(&universal_id);
      handles.push(thread::spawn(move || {
        for i in 0..iterations {
          let key = format!("blob-{worker}-{i}");
          let data = vec![worker as u8, i as u8, 42];
          let blob = build_blob(&key, data.clone());
          let cached = cache
            .cache_blob(universal_id.as_str(), &blob)
            .expect("cache blob in worker");
          let read_back = cache
            .read_binary_file(universal_id.as_str(), &cached.data)
            .expect("read cached blob");
          assert_eq!(read_back, data);
          assert!(cache.get_blob(universal_id.as_str(), &key).is_some());
        }
      }));
    }

    for handle in handles {
      handle.join().expect("worker thread should succeed");
    }

    cache.invalidate_workspace(universal_id.as_str());
  }
}
