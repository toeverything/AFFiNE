use std::{
  fs,
  path::{Path, PathBuf},
  time::SystemTime,
};

use serde::Deserialize;

use super::{
  FsStorageConfig,
  types::{
    ObjectDeleteOutcome, ObjectGetResult, ObjectListEntry, ObjectMetadata, ObjectPutMetadata, checksum_crc32_base64,
  },
};
use crate::runtime::{RuntimeError, RuntimeResult};

type Result<T> = RuntimeResult<T>;

pub(super) fn fs_bucket_path(config: &FsStorageConfig) -> PathBuf {
  if let Some(stripped) = config.root.strip_prefix("~/")
    && let Ok(Some(home)) = homedir::my_home()
  {
    return home.join(stripped).join(&config.bucket);
  }
  Path::new(&config.root).join(&config.bucket)
}

pub(super) fn normalize_storage_key(key: &str) -> Result<Vec<String>> {
  let normalized = key.replace('\\', "/");
  let segments = normalized.split('/').map(ToString::to_string).collect::<Vec<_>>();
  if normalized.is_empty()
    || normalized.starts_with('/')
    || segments
      .iter()
      .any(|segment| segment.is_empty() || segment == "." || segment == "..")
  {
    return Err(RuntimeError::invalid_input(format!("Invalid storage key: {key}")));
  }
  Ok(segments)
}

pub(super) fn normalize_storage_prefix(prefix: &str) -> Result<String> {
  let normalized = prefix.replace('\\', "/");
  if normalized.is_empty() {
    return Ok(normalized);
  }
  if normalized.starts_with('/') {
    return Err(RuntimeError::invalid_input(format!("Invalid storage prefix: {prefix}")));
  }

  let mut segments = normalized.split('/').collect::<Vec<_>>();
  let last_segment = segments.pop();
  if last_segment.is_none()
    || segments
      .iter()
      .any(|segment| segment.is_empty() || *segment == "." || *segment == "..")
    || matches!(last_segment, Some(".") | Some(".."))
  {
    return Err(RuntimeError::invalid_input(format!("Invalid storage prefix: {prefix}")));
  }

  if matches!(last_segment, Some("")) {
    return Ok(format!("{}/", segments.join("/")));
  }

  Ok(normalized)
}

fn fs_object_path(config: &FsStorageConfig, key: &str) -> Result<PathBuf> {
  let mut path = fs_bucket_path(config);
  for segment in normalize_storage_key(key)? {
    path.push(segment);
  }
  Ok(path)
}

pub(super) fn fs_put(
  config: &FsStorageConfig,
  key: &str,
  body: Vec<u8>,
  metadata: ObjectPutMetadata,
) -> Result<ObjectMetadata> {
  let path = fs_object_path(config, key)?;
  let metadata = metadata.complete_for_body(&body);
  if let Some(content_length) = metadata.content_length
    && content_length != body.len() as i64
  {
    return Err(RuntimeError::invalid_input("StorageRuntime fs content length mismatch"));
  }
  if let Some(checksum) = metadata.checksum_crc32.as_deref() {
    let actual = checksum_crc32_base64(&body);
    if actual != checksum {
      return Err(RuntimeError::invalid_input("StorageRuntime fs checksum mismatch"));
    }
  }
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|err| RuntimeError::io("StorageRuntime fs create dir failed", err))?;
  }
  fs::write(&path, &body).map_err(|err| RuntimeError::io("StorageRuntime fs write object failed", err))?;
  let object_metadata = metadata.into_object_metadata(system_time_ms(SystemTime::now())?);
  let metadata_json = serde_json::json!({
    "contentType": &object_metadata.content_type,
    "contentLength": object_metadata.content_length,
    "lastModified": object_metadata.last_modified_ms,
    "checksumCRC32": &object_metadata.checksum_crc32,
  });
  fs::write(
    PathBuf::from(format!("{}.metadata.json", path.display())),
    serde_json::to_vec(&metadata_json)
      .map_err(|err| RuntimeError::json("StorageRuntime fs serialize metadata failed", err))?,
  )
  .map_err(|err| RuntimeError::io("StorageRuntime fs write metadata failed", err))?;
  Ok(object_metadata)
}

pub(super) fn fs_head(config: &FsStorageConfig, key: &str) -> Result<Option<ObjectMetadata>> {
  let path = fs_object_path(config, key)?;
  read_fs_metadata(&path)
}

pub(super) fn fs_get(config: &FsStorageConfig, key: &str) -> Result<Option<ObjectGetResult>> {
  let path = fs_object_path(config, key)?;
  let Some(metadata) = read_fs_metadata(&path)? else {
    return Ok(None);
  };
  let body = match fs::read(&path) {
    Ok(body) => body,
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
    Err(err) => return Err(RuntimeError::io("StorageRuntime fs read object failed", err)),
  };
  Ok(Some(ObjectGetResult { body, metadata }))
}

pub(super) fn fs_list(config: &FsStorageConfig, prefix: Option<String>) -> Result<Vec<ObjectListEntry>> {
  let root = fs_bucket_path(config);
  let prefix = prefix.map(|prefix| normalize_storage_prefix(&prefix)).transpose()?;
  let mut dir = root.clone();
  let mut name_prefix = prefix.as_deref();
  if let Some(prefix) = name_prefix
    && !prefix.is_empty()
  {
    let parts = prefix.split('/').collect::<Vec<_>>();
    if parts.len() > 1 {
      for part in &parts[..parts.len() - 1] {
        dir.push(part);
      }
      name_prefix = parts.last().copied();
    }
  }

  let mut entries = Vec::new();
  collect_fs_entries(&root, &dir, name_prefix, &mut entries)?;
  entries.sort_by(|a, b| a.key.cmp(&b.key));
  Ok(entries)
}

fn collect_fs_entries(
  root: &Path,
  dir: &Path,
  name_prefix: Option<&str>,
  entries: &mut Vec<ObjectListEntry>,
) -> Result<()> {
  let read_dir = match fs::read_dir(dir) {
    Ok(read_dir) => read_dir,
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
    Err(err) => return Err(RuntimeError::io("StorageRuntime fs list failed", err)),
  };

  for entry in read_dir {
    let entry = entry.map_err(|err| RuntimeError::io("StorageRuntime fs list entry failed", err))?;
    let path = entry.path();
    let name = entry.file_name().to_string_lossy().to_string();
    if path.is_dir() {
      if name_prefix.is_none_or(|prefix| name.starts_with(prefix)) {
        collect_fs_entries(root, &path, None, entries)?;
      }
    } else if !name.ends_with(".metadata.json") && name_prefix.is_none_or(|prefix| name.starts_with(prefix)) {
      let stat = entry
        .metadata()
        .map_err(|err| RuntimeError::io("StorageRuntime fs metadata failed", err))?;
      let key = path
        .strip_prefix(root)
        .map_err(|err| RuntimeError::invalid_state(format!("StorageRuntime fs path trim failed: {err}")))?
        .to_string_lossy()
        .replace('\\', "/");
      entries.push(ObjectListEntry {
        key,
        content_length: stat.len() as i64,
        last_modified_ms: stat
          .modified()
          .ok()
          .and_then(|time| system_time_ms(time).ok())
          .unwrap_or(0),
      });
    }
  }
  Ok(())
}

pub(super) fn fs_delete(config: &FsStorageConfig, key: &str) -> Result<()> {
  let path = fs_object_path(config, key)?;
  match fs::remove_file(&path) {
    Ok(()) => {}
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
    Err(err) => return Err(RuntimeError::io("StorageRuntime fs delete object failed", err)),
  }
  match fs::remove_file(PathBuf::from(format!("{}.metadata.json", path.display()))) {
    Ok(()) => {}
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
    Err(err) => return Err(RuntimeError::io("StorageRuntime fs delete metadata failed", err)),
  }
  Ok(())
}

pub(super) fn delete_many_fs(config: FsStorageConfig, keys: Vec<String>) -> Vec<ObjectDeleteOutcome> {
  keys
    .into_iter()
    .map(|key| {
      let error = fs_delete(&config, &key).err().map(|err| err.to_string());
      ObjectDeleteOutcome { key, error }
    })
    .collect()
}

fn read_fs_metadata(path: &Path) -> Result<Option<ObjectMetadata>> {
  let raw = match fs::read_to_string(PathBuf::from(format!("{}.metadata.json", path.display()))) {
    Ok(raw) => raw,
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
    Err(err) => return Err(RuntimeError::io("StorageRuntime fs read metadata failed", err)),
  };
  let metadata: FsBlobMetadata =
    serde_json::from_str(&raw).map_err(|err| RuntimeError::json("StorageRuntime fs parse metadata failed", err))?;
  Ok(Some(ObjectMetadata {
    content_type: metadata.content_type,
    content_length: metadata.content_length,
    last_modified_ms: metadata.last_modified,
    checksum_crc32: metadata.checksum_crc32,
  }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FsBlobMetadata {
  content_type: String,
  content_length: i64,
  last_modified: i64,
  #[serde(rename = "checksumCRC32")]
  checksum_crc32: Option<String>,
}

pub(super) fn system_time_ms(time: SystemTime) -> Result<i64> {
  crate::utils::system_time_millis(time)
    .map(|millis| millis as i64)
    .map_err(|err| RuntimeError::Time {
      context: "system time before unix epoch".to_string(),
      source: err,
    })
}
#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn fs_key_normalization_rejects_traversal() {
    for (key, valid) in [
      ("", false),
      ("/a", false),
      ("a//b", false),
      ("a/./b", false),
      ("a/../b", false),
      ("..\\secret", false),
      ("workspace/blob", true),
      ("workspace\\blob", true),
    ] {
      assert_eq!(normalize_storage_key(key).is_ok(), valid, "{key}");
    }
    assert_eq!(normalize_storage_key("workspace/blob").unwrap(), ["workspace", "blob"]);
  }

  #[test]
  fn fs_prefix_normalization_rejects_traversal() {
    for (prefix, expected) in [
      ("", Some("")),
      ("workspace/", Some("workspace/")),
      ("workspace\\blob", Some("workspace/blob")),
      ("../escape", None),
      ("nested/../../escape", None),
      ("/absolute", None),
      ("nested//escape", None),
      ("nested/./escape", None),
      ("nested/../escape", None),
    ] {
      assert_eq!(normalize_storage_prefix(prefix).ok().as_deref(), expected, "{prefix}");
    }
  }

  #[test]
  fn fs_backend_preserves_sidecar_metadata_format() {
    let temp = tempfile::tempdir().unwrap();
    let config = FsStorageConfig {
      provider: "fs".to_string(),
      root: temp.path().to_string_lossy().to_string(),
      bucket: "bucket".to_string(),
    };
    let body = b"hello".to_vec();
    let checksum = checksum_crc32_base64(&body);

    fs_put(
      &config,
      "workspace/blob",
      body.clone(),
      ObjectPutMetadata {
        content_type: Some("text/plain".to_string()),
        content_length: Some(body.len() as i64),
        checksum_crc32: Some(checksum.clone()),
      },
    )
    .unwrap();

    let object_path = temp.path().join("bucket/workspace/blob");
    assert_eq!(fs::read(&object_path).unwrap(), body);
    let sidecar: serde_json::Value =
      serde_json::from_slice(&fs::read(temp.path().join("bucket/workspace/blob.metadata.json")).unwrap()).unwrap();
    assert_eq!(sidecar["contentType"], "text/plain");
    assert_eq!(sidecar["contentLength"], 5);
    assert_eq!(sidecar["checksumCRC32"], checksum);
    assert!(sidecar["lastModified"].as_i64().unwrap() > 0);

    let metadata = fs_head(&config, "workspace/blob").unwrap().unwrap();
    assert_eq!(metadata.content_type, "text/plain");
    assert_eq!(metadata.content_length, 5);
    assert_eq!(metadata.checksum_crc32.as_deref(), Some(checksum.as_str()));
    assert_eq!(fs_get(&config, "workspace/blob").unwrap().unwrap().body, body);
  }

  #[test]
  fn fs_backend_reads_existing_node_sidecar_and_lists_prefixes() {
    let temp = tempfile::tempdir().unwrap();
    let config = FsStorageConfig {
      provider: "fs".to_string(),
      root: temp.path().to_string_lossy().to_string(),
      bucket: "bucket".to_string(),
    };
    let dir = temp.path().join("bucket/workspace");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("blob-a"), b"a").unwrap();
    fs::write(
      dir.join("blob-a.metadata.json"),
      r#"{"contentType":"text/plain","contentLength":1,"lastModified":123,"checksumCRC32":"e8b7be43"}"#,
    )
    .unwrap();
    fs::create_dir_all(dir.join("nested")).unwrap();
    fs::write(dir.join("nested/blob-b"), b"b").unwrap();
    fs::write(
      dir.join("nested/blob-b.metadata.json"),
      r#"{"contentType":"text/plain","contentLength":1,"lastModified":124}"#,
    )
    .unwrap();

    let metadata = fs_head(&config, "workspace/blob-a").unwrap().unwrap();
    assert_eq!(metadata.last_modified_ms, 123);
    assert_eq!(metadata.checksum_crc32.as_deref(), Some("e8b7be43"));

    let keys = fs_list(&config, Some("workspace/".to_string()))
      .unwrap()
      .into_iter()
      .map(|entry| entry.key)
      .collect::<Vec<_>>();
    assert_eq!(keys, ["workspace/blob-a", "workspace/nested/blob-b"]);
  }

  #[test]
  fn fs_backend_lists_old_node_prefix_semantics() {
    let temp = tempfile::tempdir().unwrap();
    let config = FsStorageConfig {
      provider: "fs".to_string(),
      root: temp.path().to_string_lossy().to_string(),
      bucket: "bucket".to_string(),
    };
    for key in ["root-a", "a/item", "a/b/item", "a/b/t/item", "a/b/tail", "z/item"] {
      fs_put(&config, key, key.as_bytes().to_vec(), ObjectPutMetadata::default()).unwrap();
    }

    for (prefix, expected) in [
      (
        None,
        vec!["a/b/item", "a/b/t/item", "a/b/tail", "a/item", "root-a", "z/item"],
      ),
      (Some("a"), vec!["a/b/item", "a/b/t/item", "a/b/tail", "a/item"]),
      (Some("a/b"), vec!["a/b/item", "a/b/t/item", "a/b/tail"]),
      (Some("a/b/"), vec!["a/b/item", "a/b/t/item", "a/b/tail"]),
      (Some("a/b/t"), vec!["a/b/t/item", "a/b/tail"]),
      (Some("missing"), vec![]),
    ] {
      let keys = fs_list(&config, prefix.map(ToString::to_string))
        .unwrap()
        .into_iter()
        .map(|entry| entry.key)
        .collect::<Vec<_>>();
      assert_eq!(keys, expected, "{prefix:?}");
    }
  }

  #[test]
  fn fs_backend_delete_removes_object_and_sidecar_idempotently() {
    let temp = tempfile::tempdir().unwrap();
    let config = FsStorageConfig {
      provider: "fs".to_string(),
      root: temp.path().to_string_lossy().to_string(),
      bucket: "bucket".to_string(),
    };

    fs_put(
      &config,
      "workspace/blob",
      b"body".to_vec(),
      ObjectPutMetadata::default(),
    )
    .unwrap();
    fs_delete(&config, "workspace/blob").unwrap();
    fs_delete(&config, "workspace/blob").unwrap();

    assert!(fs_head(&config, "workspace/blob").unwrap().is_none());
    assert!(fs_get(&config, "workspace/blob").unwrap().is_none());
    assert!(!temp.path().join("bucket/workspace/blob").exists());
    assert!(!temp.path().join("bucket/workspace/blob.metadata.json").exists());
  }

  #[test]
  fn fs_backend_rejects_metadata_mismatch() {
    let temp = tempfile::tempdir().unwrap();
    let config = FsStorageConfig {
      provider: "fs".to_string(),
      root: temp.path().to_string_lossy().to_string(),
      bucket: "bucket".to_string(),
    };

    assert!(
      fs_put(
        &config,
        "workspace/blob",
        b"hello".to_vec(),
        ObjectPutMetadata {
          content_type: None,
          content_length: Some(10),
          checksum_crc32: None,
        },
      )
      .is_err()
    );
    assert!(
      fs_put(
        &config,
        "workspace/blob",
        b"hello".to_vec(),
        ObjectPutMetadata {
          content_type: None,
          content_length: None,
          checksum_crc32: Some("wrong".to_string()),
        },
      )
      .is_err()
    );
  }
}
