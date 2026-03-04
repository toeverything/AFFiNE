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

use affine_nbstore::Blob as NbBlob;
use chrono::{DateTime, Utc};

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

fn build_blob(key: &str, data: Vec<u8>) -> NbBlob {
  NbBlob {
    key: key.to_string(),
    data: data.clone(),
    mime: "application/octet-stream".to_string(),
    size: data.len() as i64,
    created_at: DateTime::<Utc>::from_timestamp_millis(0)
      .expect("valid timestamp")
      .naive_utc(),
  }
}

fn workspace_dir(cache: &MobileBlobCache, universal_id: &str) -> PathBuf {
  cache
    .workspace_dirs
    .read()
    .expect("workspace cache lock poisoned")
    .get(universal_id)
    .cloned()
    .expect("workspace should be registered")
}

fn token_path(token: &str) -> PathBuf {
  token
    .strip_prefix(MOBILE_BLOB_FILE_PREFIX)
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
  let iterations = 64;
  let mut handles = Vec::with_capacity(workers);

  for worker in 0..workers {
    let cache = Arc::clone(&cache);
    let universal_id = Arc::clone(&universal_id);
    handles.push(thread::spawn(move || {
      // Keep key cardinality under cache capacity so this test exercises
      // concurrent read/write consistency rather than LRU eviction behavior.
      let key = format!("blob-{worker}");
      for i in 0..iterations {
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

#[test]
fn concurrent_high_churn_read_tolerates_eviction_not_found() {
  let cache = Arc::new(MobileBlobCache::new());
  let universal_id = Arc::new(unique_id("concurrent-high-churn"));
  cache
    .register_workspace(universal_id.as_str(), ":memory:")
    .expect("register workspace");

  let workers = 8;
  let iterations = 64;
  let mut handles = Vec::with_capacity(workers);

  for worker in 0..workers {
    let cache = Arc::clone(&cache);
    let universal_id = Arc::clone(&universal_id);
    handles.push(thread::spawn(move || {
      let mut read_ok = 0usize;
      let mut read_not_found = 0usize;

      for i in 0..iterations {
        // Use unique keys to force churn and LRU eviction under contention.
        let key = format!("blob-{worker}-{i}");
        let data = vec![worker as u8, i as u8, 77];
        let blob = build_blob(&key, data.clone());
        let cached = cache
          .cache_blob(universal_id.as_str(), &blob)
          .expect("cache blob in worker");

        match cache.read_binary_file(universal_id.as_str(), &cached.data) {
          Ok(read_back) => {
            assert_eq!(read_back, data);
            read_ok += 1;
          }
          Err(err) => {
            assert_eq!(
              err.kind(),
              ErrorKind::NotFound,
              "unexpected read error during high churn: {err:?}"
            );
            // Once the backing file is gone, cache lookup for this unique key
            // should no longer return an entry.
            assert!(cache.get_blob(universal_id.as_str(), &key).is_none());
            read_not_found += 1;
          }
        }
      }

      (read_ok, read_not_found)
    }));
  }

  let mut total_read_ok = 0usize;
  let mut total_read_not_found = 0usize;
  for handle in handles {
    let (read_ok, read_not_found) = handle.join().expect("worker thread should succeed");
    total_read_ok += read_ok;
    total_read_not_found += read_not_found;
  }

  assert_eq!(total_read_ok + total_read_not_found, workers * iterations);

  // Deterministically force eviction to validate NotFound behavior.
  let evicted_key = "evicted-target";
  let evicted_blob = cache
    .cache_blob(universal_id.as_str(), &build_blob(evicted_key, vec![9, 9, 9]))
    .expect("cache target blob for eviction");
  for i in 0..=MOBILE_BLOB_CACHE_CAPACITY {
    let pressure_key = format!("pressure-{i}");
    cache
      .cache_blob(
        universal_id.as_str(),
        &build_blob(&pressure_key, vec![i as u8, 1, 2, 3]),
      )
      .expect("cache pressure blob");
  }
  let evicted_err = cache
    .read_binary_file(universal_id.as_str(), &evicted_blob.data)
    .expect_err("evicted token should not be readable");
  assert_eq!(evicted_err.kind(), ErrorKind::NotFound);
  assert!(cache.get_blob(universal_id.as_str(), evicted_key).is_none());

  // Cache remains healthy for subsequent writes and reads.
  let stable_blob = build_blob("post-churn", vec![1, 2, 3, 4]);
  let stable_cached = cache
    .cache_blob(universal_id.as_str(), &stable_blob)
    .expect("cache stable blob after churn");
  let stable_read = cache
    .read_binary_file(universal_id.as_str(), &stable_cached.data)
    .expect("read stable blob after churn");
  assert_eq!(stable_read, vec![1, 2, 3, 4]);
  assert!(cache.get_blob(universal_id.as_str(), "post-churn").is_some());

  cache.invalidate_workspace(universal_id.as_str());
}
