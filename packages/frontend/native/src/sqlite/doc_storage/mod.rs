mod storage;

use chrono::NaiveDateTime;
use napi::bindgen_prelude::{Buffer, Uint8Array};
use napi_derive::napi;

fn map_err(err: sqlx::Error) -> napi::Error {
  napi::Error::from(anyhow::Error::from(err))
}

#[napi(object)]
pub struct DocUpdate {
  pub doc_id: String,
  pub created_at: NaiveDateTime,
  pub data: Buffer,
}

#[napi(object)]
pub struct DocRecord {
  pub doc_id: String,
  pub data: Buffer,
  pub timestamp: NaiveDateTime,
}

#[napi(object)]
pub struct DocClock {
  pub doc_id: String,
  pub timestamp: NaiveDateTime,
}

#[napi]
pub struct DocStorage {
  storage: storage::SqliteDocStorage,
}

#[napi]
impl DocStorage {
  #[napi(constructor, async_runtime)]
  pub fn new(path: String) -> napi::Result<Self> {
    Ok(Self {
      storage: storage::SqliteDocStorage::new(path),
    })
  }

  #[napi]
  pub async fn connect(&self) -> napi::Result<()> {
    self.storage.connect().await.map_err(map_err)
  }

  #[napi]
  pub async fn close(&self) -> napi::Result<()> {
    self.storage.close().await;

    Ok(())
  }

  #[napi(getter)]
  pub async fn is_closed(&self) -> napi::Result<bool> {
    Ok(self.storage.is_closed())
  }

  #[napi]
  pub async fn push_updates(&self, doc_id: String, updates: Vec<Uint8Array>) -> napi::Result<u32> {
    let updates = updates.iter().map(|u| u.as_ref()).collect::<Vec<_>>();
    self
      .storage
      .push_updates(doc_id, updates)
      .await
      .map_err(map_err)
  }

  #[napi]
  pub async fn get_doc_snapshot(&self, doc_id: String) -> napi::Result<Option<DocRecord>> {
    self.storage.get_doc_snapshot(doc_id).await.map_err(map_err)
  }

  #[napi]
  pub async fn set_doc_snapshot(&self, snapshot: DocRecord) -> napi::Result<bool> {
    self
      .storage
      .set_doc_snapshot(snapshot)
      .await
      .map_err(map_err)
  }

  #[napi]
  pub async fn get_doc_updates(&self, doc_id: String) -> napi::Result<Vec<DocUpdate>> {
    self.storage.get_doc_updates(doc_id).await.map_err(map_err)
  }

  #[napi]
  pub async fn mark_updates_merged(
    &self,
    doc_id: String,
    updates: Vec<NaiveDateTime>,
  ) -> napi::Result<u32> {
    self
      .storage
      .mark_updates_merged(doc_id, updates)
      .await
      .map_err(map_err)
  }

  #[napi]
  pub async fn delete_doc(&self, doc_id: String) -> napi::Result<()> {
    self.storage.delete_doc(doc_id).await.map_err(map_err)
  }

  #[napi]
  pub async fn get_doc_clocks(&self, after: Option<i64>) -> napi::Result<Vec<DocClock>> {
    self.storage.get_doc_clocks(after).await.map_err(map_err)
  }

  /**
   * Flush the WAL file to the database file.
   * See https://www.sqlite.org/pragma.html#pragma_wal_checkpoint:~:text=PRAGMA%20schema.wal_checkpoint%3B
   */
  #[napi]
  pub async fn checkpoint(&self) -> napi::Result<()> {
    self.storage.checkpoint().await.map_err(map_err)
  }
}
