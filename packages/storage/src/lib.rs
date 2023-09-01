#![deny(clippy::all)]

use std::{
  collections::HashMap,
  fmt::{Debug, Display},
  path::PathBuf,
};

use jwst::BlobStorage;
use jwst_codec::Doc;
use jwst_storage::{BlobStorageType, JwstStorage, JwstStorageError};
use napi::{bindgen_prelude::*, Error, Result, Status};

#[macro_use]
extern crate napi_derive;

fn map_err_inner<T, E: Display + Debug>(v: std::result::Result<T, E>, status: Status) -> Result<T> {
  match v {
    Ok(val) => Ok(val),
    Err(e) => {
      dbg!(&e);
      Err(Error::new(status, e.to_string()))
    }
  }
}

macro_rules! map_err {
  ($val: expr) => {
    map_err_inner($val, Status::GenericFailure)
  };
  ($val: expr, $stauts: ident) => {
    map_err_inner($val, $stauts)
  };
}

macro_rules! napi_wrap {
    ($( ($name: ident, $target: ident) ),*) => {
        $(
            #[napi]
            pub struct $name($target);

            impl std::ops::Deref for $name {
                type Target = $target;

                fn deref(&self) -> &Self::Target {
                    &self.0
                }
            }

            impl From<$target> for $name {
                fn from(t: $target) -> Self {
                    Self(t)
                }
            }
        )*
    };
}

napi_wrap!((Storage, JwstStorage));

#[napi(object)]
pub struct Blob {
  pub content_type: String,
  pub last_modified: String,
  pub size: i64,
  pub data: Buffer,
}

#[napi]
impl Storage {
  /// Create a storage instance and establish connection to persist store.
  #[napi]
  pub async fn connect(database: String, debug_only_auto_migrate: Option<bool>) -> Result<Storage> {
    let inner = match if cfg!(debug_assertions) && debug_only_auto_migrate.unwrap_or(false) {
      JwstStorage::new_with_migration(&database, BlobStorageType::DB).await
    } else {
      JwstStorage::new(&database, BlobStorageType::DB).await
    } {
      Ok(storage) => storage,
      Err(JwstStorageError::Db(e)) => {
        return Err(Error::new(
          Status::GenericFailure,
          format!("failed to connect to database: {}", e),
        ));
      }
      Err(e) => return Err(Error::new(Status::GenericFailure, e.to_string())),
    };

    Ok(inner.into())
  }

  /// List all blobs in a workspace.
  #[napi]
  pub async fn list_blobs(&self, workspace_id: Option<String>) -> Result<Vec<String>> {
    map_err!(self.blobs().list_blobs(workspace_id).await)
  }

  /// Fetch a workspace blob.
  #[napi]
  pub async fn get_blob(&self, workspace_id: String, name: String) -> Result<Option<Blob>> {
    let (id, params) = {
      let path = PathBuf::from(name.clone());
      let ext = path
        .extension()
        .and_then(|s| s.to_str().map(|s| s.to_string()));
      let id = path
        .file_stem()
        .and_then(|s| s.to_str().map(|s| s.to_string()))
        .unwrap_or(name);

      (id, ext.map(|ext| HashMap::from([("format".into(), ext)])))
    };

    let Ok(meta) = self
      .blobs()
      .get_metadata(Some(workspace_id.clone()), id.clone(), params.clone())
      .await
    else {
      return Ok(None);
    };

    let Ok(file) = self.blobs().get_blob(Some(workspace_id), id, params).await else {
      return Ok(None);
    };

    Ok(Some(Blob {
      content_type: meta.content_type,
      last_modified: format!("{:?}", meta.last_modified),
      size: meta.size,
      data: file.into(),
    }))
  }

  /// Upload a blob into workspace storage.
  #[napi]
  pub async fn upload_blob(&self, workspace_id: String, blob: Buffer) -> Result<String> {
    // TODO: can optimize, avoid copy
    let blob = blob.as_ref().to_vec();
    map_err!(self.blobs().put_blob(Some(workspace_id), blob).await)
  }

  /// Delete a blob from workspace storage.
  #[napi]
  pub async fn delete_blob(&self, workspace_id: String, hash: String) -> Result<bool> {
    map_err!(self.blobs().delete_blob(Some(workspace_id), hash).await)
  }

  /// Workspace size taken by blobs.
  #[napi]
  pub async fn blobs_size(&self, workspaces: Vec<String>) -> Result<i64> {
    map_err!(self.blobs().get_blobs_size(workspaces).await)
  }
}

/// Merge updates in form like `Y.applyUpdate(doc, update)` way and return the
/// result binary.
#[napi(catch_unwind)]
pub fn merge_updates_in_apply_way(updates: Vec<Buffer>) -> Result<Buffer> {
  let mut doc = Doc::default();
  for update in updates {
    map_err!(doc.apply_update_from_binary(update.as_ref().to_vec()))?;
  }

  let buf = map_err!(doc.encode_update_v1())?;

  Ok(buf.into())
}
