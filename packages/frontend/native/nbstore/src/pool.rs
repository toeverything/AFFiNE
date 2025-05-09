use core::ops::{Deref, DerefMut};
use std::collections::hash_map::{Entry, HashMap};

use tokio::sync::{RwLock, RwLockMappedWriteGuard, RwLockReadGuard, RwLockWriteGuard};

use super::{
  error::{Error, Result},
  storage::SqliteDocStorage,
};

pub struct Ref<'a, V> {
  _guard: RwLockReadGuard<'a, V>,
}

impl<V> Deref for Ref<'_, V> {
  type Target = V;

  fn deref(&self) -> &Self::Target {
    self._guard.deref()
  }
}

pub struct RefMut<'a, V> {
  _guard: RwLockMappedWriteGuard<'a, V>,
}

impl<V> Deref for RefMut<'_, V> {
  type Target = V;

  fn deref(&self) -> &Self::Target {
    &self._guard
  }
}

impl<V> DerefMut for RefMut<'_, V> {
  fn deref_mut(&mut self) -> &mut Self::Target {
    &mut self._guard
  }
}

#[derive(Default)]
pub struct SqliteDocStoragePool {
  inner: RwLock<HashMap<String, SqliteDocStorage>>,
}

impl SqliteDocStoragePool {
  async fn get_or_create_storage<'a>(
    &'a self,
    universal_id: String,
    path: &str,
  ) -> RefMut<'a, SqliteDocStorage> {
    let lock = RwLockWriteGuard::map(self.inner.write().await, |lock| {
      match lock.entry(universal_id) {
        Entry::Occupied(entry) => entry.into_mut(),
        Entry::Vacant(entry) => {
          let storage = SqliteDocStorage::new(path.to_string());
          entry.insert(storage)
        }
      }
    });

    RefMut { _guard: lock }
  }

  pub async fn get(&self, universal_id: String) -> Result<Ref<SqliteDocStorage>> {
    let lock = RwLockReadGuard::try_map(self.inner.read().await, |lock| {
      if let Some(storage) = lock.get(&universal_id) {
        Some(storage)
      } else {
        None
      }
    });

    match lock {
      Ok(guard) => Ok(Ref { _guard: guard }),
      Err(_) => Err(Error::InvalidOperation),
    }
  }

  /// Initialize the database and run migrations.
  pub async fn connect(&self, universal_id: String, path: String) -> Result<()> {
    let storage = self
      .get_or_create_storage(universal_id.to_owned(), &path)
      .await;

    storage.connect().await?;
    Ok(())
  }

  pub async fn disconnect(&self, universal_id: String) -> Result<()> {
    let mut lock = self.inner.write().await;

    if let Entry::Occupied(entry) = lock.entry(universal_id) {
      let storage = entry.remove();
      storage.close().await;
    }

    Ok(())
  }
}
