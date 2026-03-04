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
  inner: RwLock<HashMap<String, StorageState>>,
}

enum StorageState {
  Connecting(Arc<SqliteDocStorage>),
  Connected(Arc<SqliteDocStorage>),
}

impl SqliteDocStoragePool {
  pub async fn get(&self, universal_id: String) -> Result<Ref<SqliteDocStorage>> {
    let lock = self.inner.read().await;
    let Some(state) = lock.get(&universal_id) else {
      return Err(Error::InvalidOperation);
    };
    let StorageState::Connected(storage) = state else {
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
      match lock.entry(universal_id.clone()) {
        Entry::Occupied(entry) => match entry.get() {
          StorageState::Connected(_) => return Ok(()),
          StorageState::Connecting(_) => return Err(Error::ConnectionInProgress),
        },
        Entry::Vacant(entry) => {
          let storage = Arc::new(SqliteDocStorage::new(path));
          entry.insert(StorageState::Connecting(Arc::clone(&storage)));
          storage
        }
      }
    };

    if let Err(err) = storage.connect().await {
      let mut lock = self.inner.write().await;
      if matches!(
        lock.get(&universal_id),
        Some(StorageState::Connecting(existing)) if Arc::ptr_eq(existing, &storage)
      ) {
        lock.remove(&universal_id);
      }
      return Err(err);
    }

    let mut transitioned = false;
    {
      let mut lock = self.inner.write().await;
      if matches!(
        lock.get(&universal_id),
        Some(StorageState::Connecting(existing)) if Arc::ptr_eq(existing, &storage)
      ) {
        lock.insert(universal_id.clone(), StorageState::Connected(Arc::clone(&storage)));
        transitioned = true;
      }
    }

    if !transitioned {
      let mut lock = self.inner.write().await;
      if matches!(
        lock.get(&universal_id),
        Some(StorageState::Connecting(existing)) if Arc::ptr_eq(existing, &storage)
      ) {
        lock.remove(&universal_id);
      }
      drop(lock);
      storage.close().await;
      return Err(Error::InvalidOperation);
    }

    Ok(())
  }

  pub async fn disconnect(&self, universal_id: String) -> Result<()> {
    let storage = {
      let mut lock = self.inner.write().await;
      match lock.get(&universal_id) {
        None => return Ok(()),
        Some(StorageState::Connecting(_)) => return Err(Error::ConnectionInProgress),
        Some(StorageState::Connected(storage)) => {
          // Prevent shutting down the shared storage while requests still hold refs.
          if Arc::strong_count(storage) > 1 {
            return Err(Error::InvalidOperation);
          }
        }
      }

      let Some(StorageState::Connected(storage)) = lock.remove(&universal_id) else {
        return Err(Error::InvalidOperation);
      };
      storage
    };

    storage.close().await;
    Ok(())
  }
}
