use cloud_database::SqliteDBContext;
use jwst::Workspace;
use jwst_storage::{BlobAutoStorage, DocAutoStorage};
use std::{fs, path::Path};
use tauri::api::path::document_dir;
use tokio::sync::Mutex;

pub struct AppStateRaw {
  pub doc_db: DocAutoStorage,
  /// yDoc for receiving yjs update and merge them, before serialize update into sqlite
  pub doc_store: Workspace,
  pub blob_storage: BlobAutoStorage,
  pub metadata_db: SqliteDBContext,
}

impl AppStateRaw {
  pub async fn new() -> Option<AppStateRaw> {
    let affine_document_path = Path::new(&document_dir()?.into_os_string()).join("affine");
    let metadata_db_env = format!(
      "sqlite://{}?mode=rwc",
      affine_document_path
        .join("metadata")
        .with_extension("db")
        .display()
    );
    let blob_db_env = format!(
      "sqlite://{}?mode=rwc",
      affine_document_path
        .join("blob")
        .with_extension("db")
        .display()
    );
    let doc_db_env = format!(
      "sqlite://{}?mode=rwc",
      affine_document_path
        .join("doc")
        .with_extension("db")
        .display()
    );
    fs::create_dir_all(affine_document_path.clone()).unwrap();

    Some(Self {
      doc_db: DocAutoStorage::init_pool(&doc_db_env).await.unwrap(),
      // with fake id, we only use yDoc inside of it
      // TODO: use workspace pool, to handle multiple workspace
      doc_store: Workspace::new(""),
      blob_storage: BlobAutoStorage::init_pool(&blob_db_env).await.unwrap(),
      metadata_db: SqliteDBContext::new(metadata_db_env).await,
    })
  }
}

pub struct AppState(pub Mutex<AppStateRaw>); // need pub, otherwise will be "field `0` of struct `types::state::AppState` is private"
