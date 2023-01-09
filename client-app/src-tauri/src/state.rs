use jwst_storage::{BlobFsStorage, DBContext, DocFsStorage};
use std::path::Path;
use tauri::api::path::document_dir;
use tokio::sync::Mutex;

pub struct AppStateRaw {
  pub blob_storage: BlobFsStorage,
  pub doc_storage: DocFsStorage,
  pub metadata_db: DBContext,
}

impl AppStateRaw {
  pub async fn new() -> Option<AppStateRaw> {
    let affine_document_path = Path::new(&document_dir()?.into_os_string()).join("affine");
    let doc_env = affine_document_path.join("doc");
    let blob_env = affine_document_path.join("blob");
    let db_env = format!(
      "sqlite://{}?mode=rwc",
      affine_document_path
        .join("db")
        .join("metadata.db")
        .into_os_string()
        .into_string()
        .unwrap()
    );

    Some(Self {
      doc_storage: DocFsStorage::new(Some(16), 500, Path::new(&doc_env).into()).await,
      blob_storage: BlobFsStorage::new(Some(16), Path::new(&blob_env).into()).await,
      metadata_db: DBContext::new(db_env).await,
    })
  }
}

pub struct AppState(pub Mutex<AppStateRaw>); // need pub, otherwise will be "field `0` of struct `types::state::AppState` is private"
