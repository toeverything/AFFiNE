#![deny(clippy::all)]

use std::{
  collections::HashMap,
  fmt::{Debug, Display},
  path::PathBuf,
};

use jwst::{BlobStorage, SearchResult as JwstSearchResult, Workspace as JwstWorkspace, DocStorage};
use jwst_storage::{JwstStorage, JwstStorageError};
use yrs::{Doc as YDoc, ReadTxn, StateVector, Transact};

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

napi_wrap!(
  (Storage, JwstStorage),
  (Workspace, JwstWorkspace),
  (Doc, YDoc)
);

fn to_update_v1(doc: &YDoc) -> Result<Buffer> {
  let trx = doc.transact();

  map_err!(trx.encode_state_as_update_v1(&StateVector::default())).map(|update| update.into())
}

#[napi(object)]
pub struct Blob {
  pub content_type: String,
  pub last_modified: String,
  pub size: i64,
  pub data: Buffer,
}

#[napi(object)]
pub struct SearchResult {
  pub block_id: String,
  pub score: f64,
}

impl From<JwstSearchResult> for SearchResult {
  fn from(r: JwstSearchResult) -> Self {
    Self {
      block_id: r.block_id,
      score: r.score as f64,
    }
  }
}

#[napi]
impl Storage {
  /// Create a storage instance and establish connection to persist store.
  #[napi]
  pub async fn connect(database: String, debug_only_auto_migrate: Option<bool>) -> Result<Storage> {
    let inner = match if cfg!(debug_assertions) && debug_only_auto_migrate.unwrap_or(false) {
      JwstStorage::new_with_migration(&database).await
    } else {
      JwstStorage::new(&database).await
    } {
      Ok(storage) => storage,
      Err(JwstStorageError::Db(e)) => {
        return Err(Error::new(
          Status::GenericFailure,
          format!("failed to connect to database: {}", e),
        ))
      }
      Err(e) => return Err(Error::new(Status::GenericFailure, e.to_string())),
    };

    Ok(inner.into())
  }

  /// Get a workspace by id
  #[napi]
  pub async fn get_workspace(&self, workspace_id: String) -> Result<Option<Workspace>> {
    match self.0.get_workspace(workspace_id).await {
      Ok(w) => Ok(Some(w.into())),
      Err(JwstStorageError::WorkspaceNotFound(_)) => Ok(None),
      Err(e) => Err(Error::new(Status::GenericFailure, e.to_string())),
    }
  }

  /// Create a new workspace with a init update.
  #[napi]
  pub async fn create_workspace(&self, workspace_id: String, init: Buffer) -> Result<Workspace> {
    if map_err!(self.0.docs().detect_workspace(&workspace_id).await)? {
      return Err(Error::new(
        Status::GenericFailure,
        format!("Workspace {} already exists", workspace_id),
      ));
    }

    let workspace = map_err!(self.0.create_workspace(workspace_id).await)?;

    let init = init.as_ref();
    let guid = workspace.doc_guid().to_string();
    map_err!(self.docs().update_doc(workspace.id(), guid, init).await)?;

    Ok(workspace.into())
  }

  /// Delete a workspace.
  #[napi]
  pub async fn delete_workspace(&self, workspace_id: String) -> Result<()> {
    map_err!(self.docs().delete_workspace(&workspace_id).await)?;
    map_err!(self.blobs().delete_workspace(workspace_id).await)
  }

  /// Sync doc updates.
  #[napi]
  pub async fn sync(&self, workspace_id: String, guid: String, update: Buffer) -> Result<()> {
    let update = update.as_ref();
    map_err!(self.docs().update_doc(workspace_id, guid, update).await)
  }

  /// Sync doc update with doc guid encoded.
  #[napi]
  pub async fn sync_with_guid(&self, workspace_id: String, update: Buffer) -> Result<()> {
    let update = update.as_ref();
    map_err!(self.docs().update_doc_with_guid(workspace_id, update).await)
  }

  /// Load doc as update buffer.
  #[napi]
  pub async fn load(&self, guid: String) -> Result<Option<Buffer>> {
    self.ensure_exists(&guid).await?;

    if let Some(doc) = map_err!(self.docs().get_doc(guid).await)? {
      Ok(Some(to_update_v1(&doc)?))
    } else {
      Ok(None)
    }
  }

  /// Fetch a workspace blob.
  #[napi]
  pub async fn blob(&self, workspace_id: String, name: String) -> Result<Option<Blob>> {
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

    let Ok(meta) = self.blobs().get_metadata(Some(workspace_id.clone()), id.clone(), params.clone()).await else {
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

  /// Workspace size taken by blobs.
  #[napi]
  pub async fn blobs_size(&self, workspace_id: String) -> Result<i64> {
    map_err!(self.blobs().get_blobs_size(workspace_id).await)
  }

  async fn ensure_exists(&self, guid: &str) -> Result<()> {
    if map_err!(self.docs().detect_doc(guid).await)? {
      Ok(())
    } else {
      Err(Error::new(
        Status::GenericFailure,
        format!("Doc {} not exists", guid),
      ))
    }
  }
}

#[napi]
impl Workspace {
  #[napi(getter)]
  pub fn doc(&self) -> Doc {
    self.0.doc().into()
  }

  #[napi]
  #[inline]
  pub fn is_empty(&self) -> bool {
    self.0.is_empty()
  }

  #[napi(getter)]
  #[inline]
  pub fn id(&self) -> String {
    self.0.id()
  }

  #[napi(getter)]
  #[inline]
  pub fn client_id(&self) -> String {
    self.0.client_id().to_string()
  }

  #[napi]
  pub fn search(&self, query: String) -> Result<Vec<SearchResult>> {
    // TODO: search in all subdocs
    let result = map_err!(self.0.search(&query))?;

    Ok(
      result
        .into_inner()
        .into_iter()
        .map(Into::into)
        .collect::<Vec<_>>(),
    )
  }
}

#[napi]
impl Doc {
  #[napi(getter)]
  pub fn guid(&self) -> String {
    self.0.guid().to_string()
  }
}
