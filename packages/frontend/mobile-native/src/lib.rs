use affine_common::hashcash::Stamp;
use affine_nbstore::{Data, pool::SqliteDocStoragePool};

#[derive(uniffi::Error, thiserror::Error, Debug)]
pub enum UniffiError {
  #[error("Error: {0}")]
  Err(String),
  #[error("Base64 decoding error: {0}")]
  Base64DecodingError(String),
  #[error("Timestamp decoding error")]
  TimestampDecodingError,
}

impl From<affine_nbstore::error::Error> for UniffiError {
  fn from(err: affine_nbstore::error::Error) -> Self {
    Self::Err(err.to_string())
  }
}

type Result<T> = std::result::Result<T, UniffiError>;

uniffi::setup_scaffolding!("affine_mobile_native");

#[uniffi::export]
pub fn hashcash_mint(resource: String, bits: u32) -> String {
  Stamp::mint(resource, Some(bits)).format()
}

#[derive(uniffi::Record)]
pub struct DocRecord {
  pub doc_id: String,
  // base64 encoded data
  pub bin: String,
  pub timestamp: i64,
}

impl From<affine_nbstore::DocRecord> for DocRecord {
  fn from(record: affine_nbstore::DocRecord) -> Self {
    Self {
      doc_id: record.doc_id,
      bin: base64_simd::STANDARD.encode_to_string(&record.bin),
      timestamp: record.timestamp.and_utc().timestamp_millis(),
    }
  }
}

impl TryFrom<DocRecord> for affine_nbstore::DocRecord {
  type Error = UniffiError;

  fn try_from(record: DocRecord) -> Result<Self> {
    Ok(Self {
      doc_id: record.doc_id,
      bin: Into::<Data>::into(
        base64_simd::STANDARD
          .decode_to_vec(record.bin)
          .map_err(|e| UniffiError::Base64DecodingError(e.to_string()))?,
      ),
      timestamp: chrono::DateTime::<chrono::Utc>::from_timestamp_millis(record.timestamp)
        .ok_or(UniffiError::TimestampDecodingError)?
        .naive_utc(),
    })
  }
}

#[derive(uniffi::Record)]
pub struct DocUpdate {
  pub doc_id: String,
  pub timestamp: i64,
  // base64 encoded data
  pub bin: String,
}

impl From<affine_nbstore::DocUpdate> for DocUpdate {
  fn from(update: affine_nbstore::DocUpdate) -> Self {
    Self {
      doc_id: update.doc_id,
      timestamp: update.timestamp.and_utc().timestamp_millis(),
      bin: base64_simd::STANDARD.encode_to_string(&update.bin),
    }
  }
}

impl TryFrom<DocUpdate> for affine_nbstore::DocUpdate {
  type Error = UniffiError;

  fn try_from(update: DocUpdate) -> Result<Self> {
    Ok(Self {
      doc_id: update.doc_id,
      timestamp: chrono::DateTime::<chrono::Utc>::from_timestamp_millis(update.timestamp)
        .ok_or(UniffiError::TimestampDecodingError)?
        .naive_utc(),
      bin: update.bin.into(),
    })
  }
}

#[derive(uniffi::Record)]
pub struct DocClock {
  pub doc_id: String,
  pub timestamp: i64,
}

impl From<affine_nbstore::DocClock> for DocClock {
  fn from(clock: affine_nbstore::DocClock) -> Self {
    Self {
      doc_id: clock.doc_id,
      timestamp: clock.timestamp.and_utc().timestamp_millis(),
    }
  }
}

impl TryFrom<DocClock> for affine_nbstore::DocClock {
  type Error = UniffiError;

  fn try_from(clock: DocClock) -> Result<Self> {
    Ok(Self {
      doc_id: clock.doc_id,
      timestamp: chrono::DateTime::<chrono::Utc>::from_timestamp_millis(clock.timestamp)
        .ok_or(UniffiError::TimestampDecodingError)?
        .naive_utc(),
    })
  }
}

#[derive(uniffi::Record)]
pub struct Blob {
  pub key: String,
  // base64 encoded data
  pub data: String,
  pub mime: String,
  pub size: i64,
  pub created_at: i64,
}

impl From<affine_nbstore::Blob> for Blob {
  fn from(blob: affine_nbstore::Blob) -> Self {
    Self {
      key: blob.key,
      data: base64_simd::STANDARD.encode_to_string(&blob.data),
      mime: blob.mime,
      size: blob.size,
      created_at: blob.created_at.and_utc().timestamp_millis(),
    }
  }
}

#[derive(uniffi::Record)]
pub struct SetBlob {
  pub key: String,
  // base64 encoded data
  pub data: String,
  pub mime: String,
}

impl TryFrom<SetBlob> for affine_nbstore::SetBlob {
  type Error = UniffiError;

  fn try_from(blob: SetBlob) -> Result<Self> {
    Ok(Self {
      key: blob.key,
      data: Into::<Data>::into(
        base64_simd::STANDARD
          .decode_to_vec(blob.data)
          .map_err(|e| UniffiError::Base64DecodingError(e.to_string()))?,
      ),
      mime: blob.mime,
    })
  }
}

#[derive(uniffi::Record)]
pub struct ListedBlob {
  pub key: String,
  pub size: i64,
  pub mime: String,
  pub created_at: i64,
}

impl From<affine_nbstore::ListedBlob> for ListedBlob {
  fn from(blob: affine_nbstore::ListedBlob) -> Self {
    Self {
      key: blob.key,
      size: blob.size,
      mime: blob.mime,
      created_at: blob.created_at.and_utc().timestamp_millis(),
    }
  }
}

#[derive(uniffi::Record)]
pub struct BlockInfo {
  pub block_id: String,
  pub flavour: String,
  pub content: Option<Vec<String>>,
  pub blob: Option<Vec<String>>,
  pub ref_doc_id: Option<Vec<String>>,
  pub ref_info: Option<Vec<String>>,
  pub parent_flavour: Option<String>,
  pub parent_block_id: Option<String>,
  pub additional: Option<String>,
}

impl From<affine_nbstore::indexer::NativeBlockInfo> for BlockInfo {
  fn from(value: affine_nbstore::indexer::NativeBlockInfo) -> Self {
    Self {
      block_id: value.block_id,
      flavour: value.flavour,
      content: value.content,
      blob: value.blob,
      ref_doc_id: value.ref_doc_id,
      ref_info: value.ref_info,
      parent_flavour: value.parent_flavour,
      parent_block_id: value.parent_block_id,
      additional: value.additional,
    }
  }
}

#[derive(uniffi::Record)]
pub struct CrawlResult {
  pub blocks: Vec<BlockInfo>,
  pub title: String,
  pub summary: String,
}

impl From<affine_nbstore::indexer::NativeCrawlResult> for CrawlResult {
  fn from(value: affine_nbstore::indexer::NativeCrawlResult) -> Self {
    Self {
      blocks: value.blocks.into_iter().map(Into::into).collect(),
      title: value.title,
      summary: value.summary,
    }
  }
}

#[derive(uniffi::Record)]
pub struct SearchHit {
  pub id: String,
  pub score: f64,
  pub terms: Vec<String>,
}

impl From<affine_nbstore::indexer::NativeSearchHit> for SearchHit {
  fn from(value: affine_nbstore::indexer::NativeSearchHit) -> Self {
    Self {
      id: value.id,
      score: value.score,
      terms: value.terms,
    }
  }
}

#[derive(uniffi::Record)]
pub struct MatchRange {
  pub start: u32,
  pub end: u32,
}

impl From<affine_nbstore::indexer::NativeMatch> for MatchRange {
  fn from(value: affine_nbstore::indexer::NativeMatch) -> Self {
    Self {
      start: value.start,
      end: value.end,
    }
  }
}

#[derive(uniffi::Object)]
pub struct DocStoragePool {
  inner: SqliteDocStoragePool,
}

#[uniffi::export]
pub fn new_doc_storage_pool() -> DocStoragePool {
  DocStoragePool {
    inner: Default::default(),
  }
}

#[uniffi::export(async_runtime = "tokio")]
impl DocStoragePool {
  /// Initialize the database and run migrations.
  pub async fn connect(&self, universal_id: String, path: String) -> Result<()> {
    Ok(self.inner.connect(universal_id, path).await?)
  }

  pub async fn disconnect(&self, universal_id: String) -> Result<()> {
    self.inner.disconnect(universal_id).await?;
    Ok(())
  }

  pub async fn set_space_id(&self, universal_id: String, space_id: String) -> Result<()> {
    Ok(self.inner.get(universal_id).await?.set_space_id(space_id).await?)
  }

  pub async fn push_update(&self, universal_id: String, doc_id: String, update: String) -> Result<i64> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .push_update(
          doc_id,
          base64_simd::STANDARD
            .decode_to_vec(update)
            .map_err(|e| UniffiError::Base64DecodingError(e.to_string()))?,
        )
        .await?
        .and_utc()
        .timestamp_millis(),
    )
  }

  pub async fn get_doc_snapshot(&self, universal_id: String, doc_id: String) -> Result<Option<DocRecord>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_doc_snapshot(doc_id)
        .await?
        .map(Into::into),
    )
  }

  pub async fn set_doc_snapshot(&self, universal_id: String, snapshot: DocRecord) -> Result<bool> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .set_doc_snapshot(snapshot.try_into()?)
        .await?,
    )
  }

  pub async fn get_doc_updates(&self, universal_id: String, doc_id: String) -> Result<Vec<DocUpdate>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_doc_updates(doc_id)
        .await?
        .into_iter()
        .map(Into::into)
        .collect(),
    )
  }

  pub async fn mark_updates_merged(&self, universal_id: String, doc_id: String, updates: Vec<i64>) -> Result<u32> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .mark_updates_merged(
          doc_id,
          updates
            .into_iter()
            .map(|t| {
              chrono::DateTime::<chrono::Utc>::from_timestamp_millis(t)
                .ok_or(UniffiError::TimestampDecodingError)
                .map(|t| t.naive_utc())
            })
            .collect::<Result<Vec<_>>>()?,
        )
        .await?,
    )
  }

  pub async fn delete_doc(&self, universal_id: String, doc_id: String) -> Result<()> {
    Ok(self.inner.get(universal_id).await?.delete_doc(doc_id).await?)
  }

  pub async fn get_doc_clocks(&self, universal_id: String, after: Option<i64>) -> Result<Vec<DocClock>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_doc_clocks(
          after
            .map(|t| {
              chrono::DateTime::<chrono::Utc>::from_timestamp_millis(t)
                .ok_or(UniffiError::TimestampDecodingError)
                .map(|t| t.naive_utc())
            })
            .transpose()?,
        )
        .await?
        .into_iter()
        .map(Into::into)
        .collect(),
    )
  }

  pub async fn get_doc_clock(&self, universal_id: String, doc_id: String) -> Result<Option<DocClock>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_doc_clock(doc_id)
        .await?
        .map(Into::into),
    )
  }

  pub async fn get_blob(&self, universal_id: String, key: String) -> Result<Option<Blob>> {
    Ok(self.inner.get(universal_id).await?.get_blob(key).await?.map(Into::into))
  }

  pub async fn set_blob(&self, universal_id: String, blob: SetBlob) -> Result<()> {
    Ok(self.inner.get(universal_id).await?.set_blob(blob.try_into()?).await?)
  }

  pub async fn delete_blob(&self, universal_id: String, key: String, permanently: bool) -> Result<()> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .delete_blob(key, permanently)
        .await?,
    )
  }

  pub async fn release_blobs(&self, universal_id: String) -> Result<()> {
    Ok(self.inner.get(universal_id).await?.release_blobs().await?)
  }

  pub async fn list_blobs(&self, universal_id: String) -> Result<Vec<ListedBlob>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .list_blobs()
        .await?
        .into_iter()
        .map(Into::into)
        .collect(),
    )
  }

  pub async fn get_peer_remote_clocks(&self, universal_id: String, peer: String) -> Result<Vec<DocClock>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_peer_remote_clocks(peer)
        .await?
        .into_iter()
        .map(Into::into)
        .collect(),
    )
  }

  pub async fn get_peer_remote_clock(
    &self,
    universal_id: String,
    peer: String,
    doc_id: String,
  ) -> Result<Option<DocClock>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_peer_remote_clock(peer, doc_id)
        .await?
        .map(Into::into),
    )
  }

  pub async fn set_peer_remote_clock(
    &self,
    universal_id: String,
    peer: String,
    doc_id: String,
    clock: i64,
  ) -> Result<()> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .set_peer_remote_clock(
          peer,
          doc_id,
          chrono::DateTime::<chrono::Utc>::from_timestamp_millis(clock)
            .ok_or(UniffiError::TimestampDecodingError)?
            .naive_utc(),
        )
        .await?,
    )
  }

  pub async fn get_peer_pulled_remote_clocks(&self, universal_id: String, peer: String) -> Result<Vec<DocClock>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_peer_pulled_remote_clocks(peer)
        .await?
        .into_iter()
        .map(Into::into)
        .collect(),
    )
  }

  pub async fn get_peer_pulled_remote_clock(
    &self,
    universal_id: String,
    peer: String,
    doc_id: String,
  ) -> Result<Option<DocClock>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_peer_pulled_remote_clock(peer, doc_id)
        .await?
        .map(Into::into),
    )
  }

  pub async fn set_peer_pulled_remote_clock(
    &self,
    universal_id: String,
    peer: String,
    doc_id: String,
    clock: i64,
  ) -> Result<()> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .set_peer_pulled_remote_clock(
          peer,
          doc_id,
          chrono::DateTime::<chrono::Utc>::from_timestamp_millis(clock)
            .ok_or(UniffiError::TimestampDecodingError)?
            .naive_utc(),
        )
        .await?,
    )
  }

  pub async fn get_peer_pushed_clock(
    &self,
    universal_id: String,
    peer: String,
    doc_id: String,
  ) -> Result<Option<DocClock>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_peer_pushed_clock(peer, doc_id)
        .await?
        .map(Into::into),
    )
  }

  pub async fn get_peer_pushed_clocks(&self, universal_id: String, peer: String) -> Result<Vec<DocClock>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_peer_pushed_clocks(peer)
        .await?
        .into_iter()
        .map(Into::into)
        .collect(),
    )
  }

  pub async fn set_peer_pushed_clock(
    &self,
    universal_id: String,
    peer: String,
    doc_id: String,
    clock: i64,
  ) -> Result<()> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .set_peer_pushed_clock(
          peer,
          doc_id,
          chrono::DateTime::<chrono::Utc>::from_timestamp_millis(clock)
            .ok_or(UniffiError::TimestampDecodingError)?
            .naive_utc(),
        )
        .await?,
    )
  }

  pub async fn clear_clocks(&self, universal_id: String) -> Result<()> {
    Ok(self.inner.get(universal_id).await?.clear_clocks().await?)
  }

  pub async fn set_blob_uploaded_at(
    &self,
    universal_id: String,
    peer: String,
    blob_id: String,
    uploaded_at: Option<i64>,
  ) -> Result<()> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .set_blob_uploaded_at(
          peer,
          blob_id,
          uploaded_at
            .map(|t| {
              chrono::DateTime::<chrono::Utc>::from_timestamp_millis(t)
                .ok_or(UniffiError::TimestampDecodingError)
                .map(|t| t.naive_utc())
            })
            .transpose()?,
        )
        .await?,
    )
  }

  pub async fn get_blob_uploaded_at(&self, universal_id: String, peer: String, blob_id: String) -> Result<Option<i64>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_blob_uploaded_at(peer, blob_id)
        .await?
        .map(|t| t.and_utc().timestamp_millis()),
    )
  }

  pub async fn crawl_doc_data(&self, universal_id: String, doc_id: String) -> Result<CrawlResult> {
    let result = self
      .inner
      .get(universal_id.clone())
      .await?
      .crawl_doc_data(&doc_id)
      .await?;
    Ok(result.into())
  }

  pub async fn fts_add_document(
    &self,
    universal_id: String,
    index_name: String,
    doc_id: String,
    text: String,
    index: bool,
  ) -> Result<()> {
    self
      .inner
      .get(universal_id)
      .await?
      .fts_add(&index_name, &doc_id, &text, index)
      .await?;
    Ok(())
  }

  pub async fn fts_delete_document(&self, universal_id: String, index_name: String, doc_id: String) -> Result<()> {
    self
      .inner
      .get(universal_id)
      .await?
      .fts_delete(&index_name, &doc_id)
      .await?;
    Ok(())
  }

  pub async fn fts_get_document(
    &self,
    universal_id: String,
    index_name: String,
    doc_id: String,
  ) -> Result<Option<String>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .fts_get(&index_name, &doc_id)
        .await?,
    )
  }

  pub async fn fts_search(&self, universal_id: String, index_name: String, query: String) -> Result<Vec<SearchHit>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .fts_search(&index_name, &query)
        .await?
        .into_iter()
        .map(Into::into)
        .collect(),
    )
  }

  pub async fn fts_get_matches(
    &self,
    universal_id: String,
    index_name: String,
    doc_id: String,
    query: String,
  ) -> Result<Vec<MatchRange>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .fts_get_matches(&index_name, &doc_id, &query)
        .await?
        .into_iter()
        .map(Into::into)
        .collect(),
    )
  }

  pub async fn fts_flush_index(&self, universal_id: String) -> Result<()> {
    self.inner.get(universal_id).await?.flush_index().await?;
    Ok(())
  }

  pub async fn fts_index_version(&self) -> Result<u32> {
    Ok(affine_nbstore::storage::SqliteDocStorage::index_version())
  }
}
