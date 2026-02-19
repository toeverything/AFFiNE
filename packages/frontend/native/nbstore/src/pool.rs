use core::ops::Deref;
use std::{
  collections::hash_map::{Entry, HashMap},
  sync::Arc,
};

use tokio::sync::RwLock;

use super::{
  error::{Error, Result},
  storage::SqliteDocStorage,
};

pub struct Ref<V> {
  inner: Arc<V>,
}

impl<V> Deref for Ref<V> {
  type Target = V;

  fn deref(&self) -> &Self::Target {
    self.inner.deref()
  }
}

#[derive(Default)]
pub struct SqliteDocStoragePool {
  inner: RwLock<HashMap<String, Arc<SqliteDocStorage>>>,
}

impl SqliteDocStoragePool {
  pub async fn get(&self, universal_id: String) -> Result<Ref<SqliteDocStorage>> {
    let lock = self.inner.read().await;
    let Some(storage) = lock.get(&universal_id) else {
      return Err(Error::InvalidOperation);
    };
    Ok(Ref {
      inner: Arc::clone(storage),
    })
  }

  /// Initialize the database and run migrations.
  pub async fn connect(&self, universal_id: String, path: String) -> Result<()> {
    let storage = {
      let mut lock = self.inner.write().await;
      match lock.entry(universal_id) {
        Entry::Occupied(entry) => Arc::clone(entry.get()),
        Entry::Vacant(entry) => Arc::clone(entry.insert(Arc::new(SqliteDocStorage::new(path)))),
      }
    };
    storage.connect().await?;
    Ok(())
  }

  pub async fn disconnect(&self, universal_id: String) -> Result<()> {
    let storage = {
      let mut lock = self.inner.write().await;
      lock.remove(&universal_id)
    };
    let Some(storage) = storage else {
      return Ok(());
    };

    // Prevent shutting down the shared storage while requests still hold refs.
    if Arc::strong_count(&storage) > 1 {
      let mut lock = self.inner.write().await;
      lock.insert(universal_id, storage);
      return Err(Error::InvalidOperation);
    }

    storage.close().await;
    Ok(())
  }
}
