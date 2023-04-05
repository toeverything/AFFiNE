use crate::Workspace;
use jwst::{error, info, BlobStorage, DocStorage};
use jwst_rpc::start_client;
use jwst_storage::JwstStorage as AutoStorage;
use std::sync::Arc;
use tokio::{runtime::Runtime, sync::RwLock};
use napi::bindgen_prelude::*;
use napi::{Error, Result, Status};

#[napi]
#[derive(Clone)]
pub struct Storage {
  pub(crate) storage: Option<Arc<RwLock<AutoStorage>>>,
  pub(crate) error: Option<String>,
}

#[napi]
impl Storage {
  #[napi(constructor)]
  pub fn new(path: String) -> Self {
    let rt = Runtime::new().unwrap();

    // FIXME: do not use block_on
    match rt.block_on(AutoStorage::new(&format!("sqlite:{path}?mode=rwc"))) {
      Ok(pool) => Self {
        storage: Some(Arc::new(RwLock::new(pool))),
        error: None,
      },
      Err(e) => Self {
        storage: None,
        error: Some(e.to_string()),
      },
    }
  }

  #[napi]
  pub fn error(&self) -> Option<String> {
    self.error.clone()
  }

  #[napi]
  pub async fn get_blob(&self, workspace_id: Option<String>, id: String) -> Result<Buffer> {
    if let Some(storage) = &self.storage {
      let storage_handle = storage.read().await;
      let blobs = storage_handle.blobs();

      let blob = blobs.get_blob(workspace_id.clone(), id.clone(), None).await.map_err(|e| {
        Error::new(
          Status::GenericFailure,
          format!(
            "Failed to get blob file {}/{} from storage, error: {}",
            workspace_id.clone().unwrap_or_default().to_string(),
            id,
            e
          ),
        )
      })?;

      Ok(blob.into())
    } else {
      return Err(Error::new(
        Status::GenericFailure,
        "Storage is not connected",
      ));
    }
  }

  #[napi]
  pub fn connect(&mut self, workspace_id: String, remote: String) -> Option<Workspace> {
    match self.sync(workspace_id, remote) {
      Ok(workspace) => Some(workspace),
      Err(e) => {
        error!("Failed to connect to workspace: {}", e);
        self.error = Some(e.to_string());
        None
      }
    }
  }

  #[napi]
  pub fn sync(&self, workspace_id: String, remote: String) -> Result<Workspace> {
    if let Some(storage) = &self.storage {
      let rt = Runtime::new().unwrap();

      // FIXME: do not use block_on
      let mut workspace = rt
        .block_on(async move {
          let storage = storage.read().await;

          start_client(&storage, workspace_id, remote).await
        })
        .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;

      let (sub, workspace) = {
        let id = workspace.id();
        let storage = self.storage.clone();
        let sub = workspace.observe(move |_, e| {
          let id = id.clone();
          if let Some(storage) = storage.clone() {
            let rt = Runtime::new().unwrap();
            info!("update: {:?}", &e.update);
            if let Err(e) = rt.block_on(async move {
              let storage = storage.write().await;
              storage.docs().write_update(id, &e.update).await
            }) {
              error!("Failed to write update to storage: {}", e);
            }
          }
        });

        (sub, workspace)
      };

      Ok(Workspace {
        workspace,
        _sub: sub,
      })
    } else {
      Err(Error::new(
        Status::GenericFailure,
        "Storage is not connected",
      ))
    }
  }
}
