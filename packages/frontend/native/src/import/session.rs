use std::{
  collections::HashMap,
  path::PathBuf,
  sync::{
    Arc, Mutex,
    atomic::{AtomicU64, Ordering},
  },
};

use affine_importer::{
  ImportBatchLimits, ImportOptions, ImportRegistry, ImportSession, ImportSessionOptions, ImportSource,
};
use napi::{Status, bindgen_prelude::*};
use napi_derive::napi;
use once_cell::sync::Lazy;

static IMPORT_SESSIONS: Lazy<Mutex<HashMap<String, ImportSession>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static NEXT_SESSION_ID: AtomicU64 = AtomicU64::new(1);
static IMPORT_REGISTRY: Lazy<Arc<ImportRegistry>> = Lazy::new(|| {
  let mut registry = ImportRegistry::with_builtin();
  registry.register(super::OneNoteImportProvider::new());
  Arc::new(registry)
});

#[napi(object)]
pub struct CreateImportSessionOptions {
  pub format: String,
  pub source: CreateImportSessionSource,
  pub batch_limits: Option<CreateImportBatchLimits>,
}

#[napi(object)]
pub struct CreateImportSessionSource {
  pub kind: String,
  pub path: String,
}

#[napi(object)]
pub struct CreateImportBatchLimits {
  pub max_docs: Option<u32>,
  pub max_blobs: Option<u32>,
  pub max_blob_bytes: Option<i64>,
}

fn map_import_error(error: affine_importer::ImportError) -> Error {
  let status = match error {
    affine_importer::ImportError::Cancelled => Status::Cancelled,
    affine_importer::ImportError::UnsupportedFormat(_) | affine_importer::ImportError::InvalidSource(_) => {
      Status::InvalidArg
    }
    affine_importer::ImportError::Zip(_)
    | affine_importer::ImportError::Io(_)
    | affine_importer::ImportError::Document(_) => Status::GenericFailure,
  };
  Error::new(status, error.to_string())
}

#[napi]
pub fn create_import_session(options: CreateImportSessionOptions) -> Result<String> {
  let source = match options.source.kind.as_str() {
    "filePath" => ImportSource::FilePath(PathBuf::from(options.source.path)),
    "directoryPath" => ImportSource::DirectoryPath(PathBuf::from(options.source.path)),
    kind => {
      return Err(Error::new(
        Status::InvalidArg,
        format!("unsupported import source kind: {kind}"),
      ));
    }
  };
  let mut batch_limits = ImportBatchLimits::default();
  if let Some(limits) = options.batch_limits {
    if let Some(max_docs) = limits.max_docs {
      batch_limits.max_docs = max_docs as usize;
    }
    if let Some(max_blobs) = limits.max_blobs {
      batch_limits.max_blobs = max_blobs as usize;
    }
    if let Some(max_blob_bytes) = limits.max_blob_bytes {
      if !(0..=100 * 1024 * 1024).contains(&max_blob_bytes) {
        return Err(Error::new(Status::InvalidArg, "maxBlobBytes not valid"));
      }
      batch_limits.max_blob_bytes = max_blob_bytes as u64;
    }
  }
  let session = ImportSession::create(
    ImportSessionOptions {
      format: options.format,
      source,
      import_options: ImportOptions::default(),
      batch_limits,
    },
    IMPORT_REGISTRY.clone(),
  )
  .map_err(map_import_error)?;
  let id = format!("import-session-{}", NEXT_SESSION_ID.fetch_add(1, Ordering::Relaxed));
  IMPORT_SESSIONS
    .lock()
    .map_err(|_| Error::new(Status::GenericFailure, "import session registry poisoned"))?
    .insert(id.clone(), session);
  Ok(id)
}

#[napi]
pub fn next_import_batch(session_id: String) -> Result<Option<String>> {
  let mut sessions = IMPORT_SESSIONS
    .lock()
    .map_err(|_| Error::new(Status::GenericFailure, "import session registry poisoned"))?;
  let session = sessions
    .get_mut(&session_id)
    .ok_or_else(|| Error::new(Status::InvalidArg, format!("unknown import session: {session_id}")))?;
  session
    .next_batch()
    .map_err(map_import_error)?
    .map(|batch| serde_json::to_string(&batch).map_err(|err| Error::new(Status::GenericFailure, err.to_string())))
    .transpose()
}

#[napi]
pub fn cancel_import_session(session_id: String) -> Result<()> {
  let mut sessions = IMPORT_SESSIONS
    .lock()
    .map_err(|_| Error::new(Status::GenericFailure, "import session registry poisoned"))?;
  let session = sessions
    .get_mut(&session_id)
    .ok_or_else(|| Error::new(Status::InvalidArg, format!("unknown import session: {session_id}")))?;
  session.cancel();
  Ok(())
}

#[napi]
pub fn dispose_import_session(session_id: String) -> Result<()> {
  IMPORT_SESSIONS
    .lock()
    .map_err(|_| Error::new(Status::GenericFailure, "import session registry poisoned"))?
    .remove(&session_id);
  Ok(())
}

#[cfg(test)]
mod tests {
  use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
  };

  use zip::{ZipWriter, write::SimpleFileOptions};

  use super::*;

  static NEXT_TEST_ARCHIVE_ID: AtomicU64 = AtomicU64::new(1);

  fn archive_path(entries: &[(&str, &[u8])]) -> PathBuf {
    let path = std::env::temp_dir().join(format!(
      "affine-native-import-{}-{}.zip",
      std::process::id(),
      NEXT_TEST_ARCHIVE_ID.fetch_add(1, Ordering::Relaxed)
    ));
    let file = std::fs::File::create(&path).unwrap();
    let mut writer = ZipWriter::new(file);
    for (path, bytes) in entries {
      writer.start_file(path, SimpleFileOptions::default()).unwrap();
      writer.write_all(bytes).unwrap();
    }
    writer.finish().unwrap();
    path
  }

  fn directory_path(entries: &[(&str, &[u8])]) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
      "affine-native-import-dir-{}-{}",
      std::process::id(),
      NEXT_TEST_ARCHIVE_ID.fetch_add(1, Ordering::Relaxed)
    ));
    for (path, bytes) in entries {
      let path = root.join(path);
      fs::create_dir_all(path.parent().unwrap()).unwrap();
      fs::write(path, bytes).unwrap();
    }
    root
  }

  #[test]
  fn import_session_returns_one_serialized_batch() {
    let path = archive_path(&[("entry.md", b"entry")]);
    let id = create_import_session(CreateImportSessionOptions {
      format: "markdownZip".to_string(),
      source: CreateImportSessionSource {
        kind: "filePath".to_string(),
        path: path.to_string_lossy().to_string(),
      },
      batch_limits: None,
    })
    .unwrap();

    let batch = next_import_batch(id.clone()).unwrap().unwrap();
    assert!(batch.contains("\"docs\""));
    assert!(next_import_batch(id.clone()).unwrap().is_none());
    dispose_import_session(id).unwrap();
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn import_session_cancel_blocks_next_batch() {
    let path = archive_path(&[("entry.md", b"entry")]);
    let id = create_import_session(CreateImportSessionOptions {
      format: "markdownZip".to_string(),
      source: CreateImportSessionSource {
        kind: "filePath".to_string(),
        path: path.to_string_lossy().to_string(),
      },
      batch_limits: None,
    })
    .unwrap();

    cancel_import_session(id.clone()).unwrap();
    assert!(next_import_batch(id.clone()).is_err());
    dispose_import_session(id).unwrap();
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn import_session_accepts_directory_source() {
    let path = directory_path(&[("entry.md", b"entry")]);
    let id = create_import_session(CreateImportSessionOptions {
      format: "obsidian".to_string(),
      source: CreateImportSessionSource {
        kind: "directoryPath".to_string(),
        path: path.to_string_lossy().to_string(),
      },
      batch_limits: None,
    })
    .unwrap();

    let batch = next_import_batch(id.clone()).unwrap().unwrap();
    assert!(batch.contains("\"docs\""));
    assert!(next_import_batch(id.clone()).unwrap().is_none());
    dispose_import_session(id).unwrap();
    let _ = fs::remove_dir_all(path);
  }

  #[test]
  fn import_session_rejects_negative_blob_byte_limit() {
    let path = archive_path(&[("entry.md", b"entry")]);
    let result = create_import_session(CreateImportSessionOptions {
      format: "markdownZip".to_string(),
      source: CreateImportSessionSource {
        kind: "filePath".to_string(),
        path: path.to_string_lossy().to_string(),
      },
      batch_limits: Some(CreateImportBatchLimits {
        max_docs: None,
        max_blobs: None,
        max_blob_bytes: Some(-1),
      }),
    });

    assert!(result.is_err());
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn import_session_routes_onenote_format_to_provider() {
    let path = archive_path(&[("entry.md", b"entry")]);
    let result = create_import_session(CreateImportSessionOptions {
      format: "oneNote".to_string(),
      source: CreateImportSessionSource {
        kind: "filePath".to_string(),
        path: path.to_string_lossy().to_string(),
      },
      batch_limits: None,
    });

    let error = result.unwrap_err().to_string();
    assert!(error.contains("unsupported OneNote source"));
    let _ = std::fs::remove_file(path);
  }
}
