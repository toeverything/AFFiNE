use jwst_storage::{BlobFsStorage, DocFsStorage, SqliteDBContext};
use std::{fs, path::Path};
use tauri::api::path::document_dir;
use tokio::sync::Mutex;

pub struct AppStateRaw {
  pub blob_storage: BlobFsStorage,
  pub doc_storage: DocFsStorage,
  pub metadata_db: SqliteDBContext,
}

impl AppStateRaw {
  pub async fn new() -> Option<AppStateRaw> {
    let affine_document_path = Path::new(&document_dir()?.into_os_string()).join("affine");
    let doc_path = affine_document_path.join("doc");
    let blob_env = affine_document_path.join("blob");
    let db_env = format!(
      "sqlite://{}?mode=rwc",
      affine_document_path
        .join("metadata.db")
        .into_os_string()
        .into_string()
        .unwrap()
    );
    fs::create_dir_all(doc_path.clone()).unwrap();
    fs::create_dir_all(blob_env.clone()).unwrap();

    Some(Self {
      doc_storage: DocFsStorage::new(Some(16), 500, Path::new(&doc_path).into()).await,
      blob_storage: BlobFsStorage::new(Some(16), Path::new(&blob_env).into()).await,
      metadata_db: SqliteDBContext::new(db_env).await,
    })
  }
}

pub struct AppState(pub Mutex<AppStateRaw>); // need pub, otherwise will be "field `0` of struct `types::state::AppState` is private"
