pub mod blob;
pub mod blob_sync;
pub mod doc;
pub mod doc_sync;
pub mod error;
pub mod indexer;
pub mod indexer_sync;
pub mod pool;
pub mod storage;

use chrono::NaiveDateTime;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use pool::{Ref, SqliteDocStoragePool};
use storage::SqliteDocStorage;

#[cfg(feature = "use-as-lib")]
type Result<T> = anyhow::Result<T>;

#[cfg(not(feature = "use-as-lib"))]
type Result<T> = napi::Result<T>;

#[cfg(not(feature = "use-as-lib"))]
impl From<error::Error> for napi::Error {
  fn from(err: error::Error) -> Self {
    napi::Error::new(napi::Status::GenericFailure, err.to_string())
  }
}

#[cfg(feature = "use-as-lib")]
pub type Data = Vec<u8>;

#[cfg(not(feature = "use-as-lib"))]
pub type Data = Uint8Array;

#[napi(object)]
pub struct DocUpdate {
  pub doc_id: String,
  pub timestamp: NaiveDateTime,
  #[napi(ts_type = "Uint8Array")]
  pub bin: Data,
}

#[napi(object)]
pub struct DocRecord {
  pub doc_id: String,
  #[napi(ts_type = "Uint8Array")]
  pub bin: Data,
  pub timestamp: NaiveDateTime,
}

#[derive(Debug)]
#[napi(object)]
pub struct DocClock {
  pub doc_id: String,
  pub timestamp: NaiveDateTime,
}

#[derive(Debug)]
#[napi(object)]
pub struct DocIndexedClock {
  pub doc_id: String,
  pub timestamp: NaiveDateTime,
  pub indexer_version: i64,
}

#[napi(object)]
pub struct SetBlob {
  pub key: String,
  #[napi(ts_type = "Uint8Array")]
  pub data: Data,
  pub mime: String,
}

#[napi(object)]
pub struct Blob {
  pub key: String,
  #[napi(ts_type = "Uint8Array")]
  pub data: Data,
  pub mime: String,
  pub size: i64,
  pub created_at: NaiveDateTime,
}

#[napi(object)]
pub struct ListedBlob {
  pub key: String,
  pub size: i64,
  pub mime: String,
  pub created_at: NaiveDateTime,
}

#[napi]
pub struct DocStoragePool {
  pool: SqliteDocStoragePool,
}

#[napi]
impl DocStoragePool {
  #[napi(constructor)]
  pub fn new() -> Result<Self> {
    Ok(Self {
      pool: SqliteDocStoragePool::default(),
    })
  }

  async fn get(&self, universal_id: String) -> Result<Ref<'_, SqliteDocStorage>> {
    Ok(self.pool.get(universal_id).await?)
  }

  #[napi]
  /// Initialize the database and run migrations.
  pub async fn connect(&self, universal_id: String, path: String) -> Result<()> {
    self.pool.connect(universal_id, path).await?;
    Ok(())
  }

  #[napi]
  pub async fn disconnect(&self, universal_id: String) -> Result<()> {
    self.pool.disconnect(universal_id).await?;
    Ok(())
  }

  #[napi]
  pub async fn checkpoint(&self, universal_id: String) -> Result<()> {
    self.pool.get(universal_id).await?.checkpoint().await?;
    Ok(())
  }

  #[napi]
  pub async fn crawl_doc_data(&self, universal_id: String, doc_id: String) -> Result<indexer::NativeCrawlResult> {
    let result = self.get(universal_id).await?.crawl_doc_data(&doc_id).await?;
    Ok(result)
  }

  #[napi]
  pub async fn set_space_id(&self, universal_id: String, space_id: String) -> Result<()> {
    self.get(universal_id).await?.set_space_id(space_id).await?;
    Ok(())
  }

  #[napi]
  pub async fn push_update(&self, universal_id: String, doc_id: String, update: Uint8Array) -> Result<NaiveDateTime> {
    Ok(self.get(universal_id).await?.push_update(doc_id, update).await?)
  }

  #[napi]
  pub async fn get_doc_snapshot(&self, universal_id: String, doc_id: String) -> Result<Option<DocRecord>> {
    Ok(self.get(universal_id).await?.get_doc_snapshot(doc_id).await?)
  }

  #[napi]
  pub async fn set_doc_snapshot(&self, universal_id: String, snapshot: DocRecord) -> Result<bool> {
    Ok(self.get(universal_id).await?.set_doc_snapshot(snapshot).await?)
  }

  #[napi]
  pub async fn get_doc_updates(&self, universal_id: String, doc_id: String) -> Result<Vec<DocUpdate>> {
    Ok(self.get(universal_id).await?.get_doc_updates(doc_id).await?)
  }

  #[napi]
  pub async fn mark_updates_merged(
    &self,
    universal_id: String,
    doc_id: String,
    updates: Vec<NaiveDateTime>,
  ) -> Result<u32> {
    Ok(
      self
        .get(universal_id)
        .await?
        .mark_updates_merged(doc_id, updates)
        .await?,
    )
  }

  #[napi]
  pub async fn delete_doc(&self, universal_id: String, doc_id: String) -> Result<()> {
    self.get(universal_id).await?.delete_doc(doc_id).await?;
    Ok(())
  }

  #[napi]
  pub async fn get_doc_clocks(&self, universal_id: String, after: Option<NaiveDateTime>) -> Result<Vec<DocClock>> {
    Ok(self.get(universal_id).await?.get_doc_clocks(after).await?)
  }

  #[napi]
  pub async fn get_doc_clock(&self, universal_id: String, doc_id: String) -> Result<Option<DocClock>> {
    Ok(self.get(universal_id).await?.get_doc_clock(doc_id).await?)
  }

  #[napi]
  pub async fn get_doc_indexed_clock(&self, universal_id: String, doc_id: String) -> Result<Option<DocIndexedClock>> {
    Ok(self.get(universal_id).await?.get_doc_indexed_clock(doc_id).await?)
  }

  #[napi]
  pub async fn set_doc_indexed_clock(
    &self,
    universal_id: String,
    doc_id: String,
    indexed_clock: NaiveDateTime,
    indexer_version: i64,
  ) -> Result<()> {
    self
      .get(universal_id)
      .await?
      .set_doc_indexed_clock(doc_id, indexed_clock, indexer_version)
      .await?;
    Ok(())
  }

  #[napi]
  pub async fn clear_doc_indexed_clock(&self, universal_id: String, doc_id: String) -> Result<()> {
    self.get(universal_id).await?.clear_doc_indexed_clock(doc_id).await?;
    Ok(())
  }

  #[napi(async_runtime)]
  pub async fn get_blob(&self, universal_id: String, key: String) -> Result<Option<Blob>> {
    Ok(self.get(universal_id).await?.get_blob(key).await?)
  }

  #[napi]
  pub async fn set_blob(&self, universal_id: String, blob: SetBlob) -> Result<()> {
    self.get(universal_id).await?.set_blob(blob).await?;
    Ok(())
  }

  #[napi]
  pub async fn delete_blob(&self, universal_id: String, key: String, permanently: bool) -> Result<()> {
    self.get(universal_id).await?.delete_blob(key, permanently).await?;
    Ok(())
  }

  #[napi]
  pub async fn release_blobs(&self, universal_id: String) -> Result<()> {
    self.get(universal_id).await?.release_blobs().await?;
    Ok(())
  }

  #[napi]
  pub async fn list_blobs(&self, universal_id: String) -> Result<Vec<ListedBlob>> {
    Ok(self.get(universal_id).await?.list_blobs().await?)
  }

  #[napi]
  pub async fn get_peer_remote_clocks(&self, universal_id: String, peer: String) -> Result<Vec<DocClock>> {
    Ok(self.get(universal_id).await?.get_peer_remote_clocks(peer).await?)
  }

  #[napi]
  pub async fn get_peer_remote_clock(
    &self,
    universal_id: String,
    peer: String,
    doc_id: String,
  ) -> Result<Option<DocClock>> {
    Ok(
      self
        .get(universal_id)
        .await?
        .get_peer_remote_clock(peer, doc_id)
        .await?,
    )
  }

  #[napi]
  pub async fn set_peer_remote_clock(
    &self,
    universal_id: String,
    peer: String,
    doc_id: String,
    clock: NaiveDateTime,
  ) -> Result<()> {
    self
      .get(universal_id)
      .await?
      .set_peer_remote_clock(peer, doc_id, clock)
      .await?;
    Ok(())
  }

  #[napi]
  pub async fn get_peer_pulled_remote_clocks(&self, universal_id: String, peer: String) -> Result<Vec<DocClock>> {
    Ok(
      self
        .get(universal_id)
        .await?
        .get_peer_pulled_remote_clocks(peer)
        .await?,
    )
  }

  #[napi]
  pub async fn get_peer_pulled_remote_clock(
    &self,
    universal_id: String,
    peer: String,
    doc_id: String,
  ) -> Result<Option<DocClock>> {
    Ok(
      self
        .get(universal_id)
        .await?
        .get_peer_pulled_remote_clock(peer, doc_id)
        .await?,
    )
  }

  #[napi]
  pub async fn set_peer_pulled_remote_clock(
    &self,
    universal_id: String,
    peer: String,
    doc_id: String,
    clock: NaiveDateTime,
  ) -> Result<()> {
    self
      .get(universal_id)
      .await?
      .set_peer_pulled_remote_clock(peer, doc_id, clock)
      .await?;
    Ok(())
  }

  #[napi]
  pub async fn get_peer_pushed_clocks(&self, universal_id: String, peer: String) -> Result<Vec<DocClock>> {
    Ok(self.get(universal_id).await?.get_peer_pushed_clocks(peer).await?)
  }

  #[napi]
  pub async fn get_peer_pushed_clock(
    &self,
    universal_id: String,
    peer: String,
    doc_id: String,
  ) -> Result<Option<DocClock>> {
    Ok(
      self
        .get(universal_id)
        .await?
        .get_peer_pushed_clock(peer, doc_id)
        .await?,
    )
  }

  #[napi]
  pub async fn set_peer_pushed_clock(
    &self,
    universal_id: String,
    peer: String,
    doc_id: String,
    clock: NaiveDateTime,
  ) -> Result<()> {
    self
      .get(universal_id)
      .await?
      .set_peer_pushed_clock(peer, doc_id, clock)
      .await?;
    Ok(())
  }

  #[napi]
  pub async fn clear_clocks(&self, universal_id: String) -> Result<()> {
    self.get(universal_id).await?.clear_clocks().await?;
    Ok(())
  }

  #[napi]
  pub async fn set_blob_uploaded_at(
    &self,
    universal_id: String,
    peer: String,
    blob_id: String,
    uploaded_at: Option<NaiveDateTime>,
  ) -> Result<()> {
    self
      .get(universal_id)
      .await?
      .set_blob_uploaded_at(peer, blob_id, uploaded_at)
      .await?;
    Ok(())
  }

  #[napi]
  pub async fn get_blob_uploaded_at(
    &self,
    universal_id: String,
    peer: String,
    blob_id: String,
  ) -> Result<Option<NaiveDateTime>> {
    let result = self
      .get(universal_id)
      .await?
      .get_blob_uploaded_at(peer, blob_id)
      .await?;

    Ok(result)
  }

  #[napi]
  pub async fn fts_add_document(
    &self,
    id: String,
    index_name: String,
    doc_id: String,
    text: String,
    index: bool,
  ) -> Result<()> {
    let storage = self.pool.get(id).await?;
    storage.fts_add(&index_name, &doc_id, &text, index).await?;
    Ok(())
  }

  #[napi]
  pub async fn fts_flush_index(&self, id: String) -> Result<()> {
    let storage = self.pool.get(id).await?;
    storage.flush_index().await?;
    Ok(())
  }

  #[napi]
  pub async fn fts_index_version(&self) -> Result<u32> {
    Ok(SqliteDocStorage::index_version())
  }

  #[napi]
  pub async fn fts_delete_document(&self, id: String, index_name: String, doc_id: String) -> Result<()> {
    let storage = self.pool.get(id).await?;
    storage.fts_delete(&index_name, &doc_id).await?;
    Ok(())
  }

  #[napi]
  pub async fn fts_get_document(&self, id: String, index_name: String, doc_id: String) -> Result<Option<String>> {
    let storage = self.pool.get(id).await?;
    Ok(storage.fts_get(&index_name, &doc_id).await?)
  }

  #[napi]
  pub async fn fts_search(
    &self,
    id: String,
    index_name: String,
    query: String,
  ) -> Result<Vec<indexer::NativeSearchHit>> {
    let storage = self.pool.get(id).await?;
    Ok(storage.fts_search(&index_name, &query).await?)
  }

  #[napi]
  pub async fn fts_get_matches(
    &self,
    id: String,
    index_name: String,
    doc_id: String,
    query: String,
  ) -> Result<Vec<indexer::NativeMatch>> {
    let storage = self.pool.get(id).await?;
    Ok(storage.fts_get_matches(&index_name, &doc_id, &query).await?)
  }
}

#[napi]
pub struct DocStorage {
  storage: SqliteDocStorage,
}

#[napi]
impl DocStorage {
  #[napi(constructor, async_runtime)]
  pub fn new(path: String) -> Self {
    Self {
      storage: SqliteDocStorage::new(path),
    }
  }

  #[napi]
  pub async fn validate(&self) -> Result<bool> {
    Ok(self.storage.validate().await?)
  }

  #[napi]
  pub async fn set_space_id(&self, space_id: String) -> Result<()> {
    self.storage.connect().await?;
    self.storage.set_space_id(space_id).await?;
    self.storage.close().await;
    Ok(())
  }
}
