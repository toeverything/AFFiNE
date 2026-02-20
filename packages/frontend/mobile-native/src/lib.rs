#[cfg(any(target_os = "android", target_os = "ios", test))]
use std::sync::Arc;

use affine_common::hashcash::Stamp;
use affine_nbstore::{Data, pool::SqliteDocStoragePool};
#[cfg(any(target_os = "android", target_os = "ios", test))]
#[cfg_attr(all(test, not(any(target_os = "android", target_os = "ios"))), allow(dead_code))]
pub(crate) mod mobile_blob_cache;
#[cfg(any(target_os = "android", target_os = "ios", test))]
use mobile_blob_cache::{MOBILE_BLOB_INLINE_THRESHOLD_BYTES, MobileBlobCache, is_mobile_binary_file_token};

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

fn decode_base64_data(data: &str) -> Result<Vec<u8>> {
  base64_simd::STANDARD
    .decode_to_vec(data)
    .map_err(|e| UniffiError::Base64DecodingError(e.to_string()))
}

#[uniffi::export]
pub fn hashcash_mint(resource: String, bits: u32) -> String {
  Stamp::mint(resource, Some(bits)).format()
}

#[derive(uniffi::Record)]
pub struct DocRecord {
  pub doc_id: String,
  // base64 encoded data; on mobile large payloads this can be a file-path token
  // prefixed with "__AFFINE_DOC_FILE__:"
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
      bin: Into::<Data>::into(decode_base64_data(&record.bin)?),
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
  // base64 encoded data; on mobile large payloads this can be a file-path token
  // prefixed with "__AFFINE_DOC_FILE__:"
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
      bin: Into::<Data>::into(decode_base64_data(&update.bin)?),
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
  // base64 encoded data; on mobile large blobs this is a file-path token prefixed
  // with "__AFFINE_BLOB_FILE__:"
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
  // base64 encoded data; mobile file-path tokens are also accepted
  pub data: String,
  pub mime: String,
}

impl TryFrom<SetBlob> for affine_nbstore::SetBlob {
  type Error = UniffiError;

  fn try_from(blob: SetBlob) -> Result<Self> {
    Ok(Self {
      key: blob.key,
      data: Into::<Data>::into(decode_base64_data(&blob.data)?),
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
  #[cfg(any(target_os = "android", target_os = "ios", test))]
  mobile_blob_cache: Arc<MobileBlobCache>,
}

#[uniffi::export]
pub fn new_doc_storage_pool() -> DocStoragePool {
  DocStoragePool {
    inner: Default::default(),
    #[cfg(any(target_os = "android", target_os = "ios", test))]
    mobile_blob_cache: Arc::new(MobileBlobCache::new()),
  }
}

impl DocStoragePool {
  #[cfg(any(target_os = "android", target_os = "ios", test))]
  async fn run_mobile_cache_io<T, F>(&self, task: F, context: &'static str) -> Result<T>
  where
    T: Send + 'static,
    F: FnOnce(Arc<MobileBlobCache>) -> std::io::Result<T> + Send + 'static,
  {
    let cache = Arc::clone(&self.mobile_blob_cache);
    tokio::task::spawn_blocking(move || task(cache))
      .await
      .map_err(|err| UniffiError::Err(format!("{context}: {err}")))?
      .map_err(|err| UniffiError::Err(format!("{context}: {err}")))
  }
}

#[uniffi::export(async_runtime = "tokio")]
impl DocStoragePool {
  async fn decode_mobile_data(&self, universal_id: &str, data: &str) -> Result<Vec<u8>> {
    #[cfg(any(target_os = "android", target_os = "ios", test))]
    if is_mobile_binary_file_token(data) {
      let universal_id = universal_id.to_string();
      let data = data.to_string();
      return self
        .run_mobile_cache_io(
          move |cache| cache.read_binary_file(&universal_id, &data),
          "Failed to read mobile file token",
        )
        .await;
    }
    #[cfg(not(any(target_os = "android", target_os = "ios", test)))]
    let _ = universal_id;

    decode_base64_data(data)
  }

  async fn encode_doc_data(&self, universal_id: &str, doc_id: &str, timestamp: i64, data: &[u8]) -> Result<String> {
    #[cfg(any(target_os = "android", target_os = "ios", test))]
    if data.len() >= MOBILE_BLOB_INLINE_THRESHOLD_BYTES {
      let universal_id = universal_id.to_string();
      let doc_id = doc_id.to_string();
      let data = data.to_vec();
      return self
        .run_mobile_cache_io(
          move |cache| cache.cache_doc_bin(&universal_id, &doc_id, timestamp, &data),
          "Failed to cache doc file",
        )
        .await;
    }
    #[cfg(not(any(target_os = "android", target_os = "ios", test)))]
    let _ = (universal_id, doc_id, timestamp);

    Ok(base64_simd::STANDARD.encode_to_string(data))
  }

  /// Initialize the database and run migrations.
  pub async fn connect(&self, universal_id: String, path: String) -> Result<()> {
    #[cfg(any(target_os = "android", target_os = "ios", test))]
    {
      let universal_id_for_cache = universal_id.clone();
      let path_for_cache = path.clone();
      self
        .run_mobile_cache_io(
          move |cache| cache.register_workspace(&universal_id_for_cache, &path_for_cache),
          "Failed to initialize mobile blob cache",
        )
        .await?;
    }

    if let Err(err) = self.inner.connect(universal_id.clone(), path).await {
      #[cfg(any(target_os = "android", target_os = "ios", test))]
      {
        let universal_id_for_cache = universal_id.clone();
        let _ = self
          .run_mobile_cache_io(
            move |cache| {
              cache.invalidate_workspace(&universal_id_for_cache);
              Ok(())
            },
            "Failed to rollback mobile blob cache workspace",
          )
          .await;
      }
      return Err(err.into());
    }

    Ok(())
  }

  pub async fn disconnect(&self, universal_id: String) -> Result<()> {
    #[cfg(any(target_os = "android", target_os = "ios", test))]
    {
      let universal_id_for_cache = universal_id.clone();
      self
        .run_mobile_cache_io(
          move |cache| {
            cache.invalidate_workspace(&universal_id_for_cache);
            Ok(())
          },
          "Failed to clear mobile blob cache workspace",
        )
        .await?;
    }
    self.inner.disconnect(universal_id).await?;
    Ok(())
  }

  pub async fn set_space_id(&self, universal_id: String, space_id: String) -> Result<()> {
    Ok(self.inner.get(universal_id).await?.set_space_id(space_id).await?)
  }

  pub async fn push_update(&self, universal_id: String, doc_id: String, update: String) -> Result<i64> {
    let decoded_update = self.decode_mobile_data(&universal_id, &update).await?;
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .push_update(doc_id, decoded_update)
        .await?
        .and_utc()
        .timestamp_millis(),
    )
  }

  pub async fn get_doc_snapshot(&self, universal_id: String, doc_id: String) -> Result<Option<DocRecord>> {
    let Some(record) = self
      .inner
      .get(universal_id.clone())
      .await?
      .get_doc_snapshot(doc_id)
      .await?
    else {
      return Ok(None);
    };

    let timestamp = record.timestamp.and_utc().timestamp_millis();
    let bin = self
      .encode_doc_data(&universal_id, &record.doc_id, timestamp, &record.bin)
      .await?;
    Ok(Some(DocRecord {
      doc_id: record.doc_id,
      bin,
      timestamp,
    }))
  }

  pub async fn set_doc_snapshot(&self, universal_id: String, snapshot: DocRecord) -> Result<bool> {
    let doc_record = affine_nbstore::DocRecord {
      doc_id: snapshot.doc_id,
      bin: Into::<Data>::into(self.decode_mobile_data(&universal_id, &snapshot.bin).await?),
      timestamp: chrono::DateTime::<chrono::Utc>::from_timestamp_millis(snapshot.timestamp)
        .ok_or(UniffiError::TimestampDecodingError)?
        .naive_utc(),
    };
    Ok(self.inner.get(universal_id).await?.set_doc_snapshot(doc_record).await?)
  }

  pub async fn get_doc_updates(&self, universal_id: String, doc_id: String) -> Result<Vec<DocUpdate>> {
    let updates = self
      .inner
      .get(universal_id.clone())
      .await?
      .get_doc_updates(doc_id)
      .await?;

    let mut converted = Vec::with_capacity(updates.len());
    for update in updates {
      let timestamp = update.timestamp.and_utc().timestamp_millis();
      let bin = self
        .encode_doc_data(&universal_id, &update.doc_id, timestamp, &update.bin)
        .await?;
      converted.push(DocUpdate {
        doc_id: update.doc_id,
        timestamp,
        bin,
      });
    }
    Ok(converted)
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
    #[cfg(any(target_os = "android", target_os = "ios", test))]
    {
      let universal_id_for_cache = universal_id.clone();
      let key_for_cache = key.clone();
      if let Some(blob) = self
        .run_mobile_cache_io(
          move |cache| Ok(cache.get_blob(&universal_id_for_cache, &key_for_cache)),
          "Failed to read mobile blob cache",
        )
        .await?
      {
        return Ok(Some(blob));
      }

      let Some(blob) = self
        .inner
        .get(universal_id.clone())
        .await?
        .get_blob(key.clone())
        .await?
      else {
        return Ok(None);
      };

      if blob.data.len() < MOBILE_BLOB_INLINE_THRESHOLD_BYTES {
        return Ok(Some(blob.into()));
      }

      let universal_id_for_cache = universal_id.clone();
      return self
        .run_mobile_cache_io(
          move |cache| cache.cache_blob(&universal_id_for_cache, &blob).map(Some),
          "Failed to cache blob file",
        )
        .await;
    }

    #[cfg(not(any(target_os = "android", target_os = "ios", test)))]
    {
      Ok(self.inner.get(universal_id).await?.get_blob(key).await?.map(Into::into))
    }
  }

  pub async fn set_blob(&self, universal_id: String, blob: SetBlob) -> Result<()> {
    #[cfg(any(target_os = "android", target_os = "ios", test))]
    let key = blob.key.clone();
    let blob = affine_nbstore::SetBlob {
      key: blob.key,
      data: Into::<Data>::into(self.decode_mobile_data(&universal_id, &blob.data).await?),
      mime: blob.mime,
    };
    self.inner.get(universal_id.clone()).await?.set_blob(blob).await?;
    #[cfg(any(target_os = "android", target_os = "ios", test))]
    {
      let universal_id_for_cache = universal_id;
      self
        .run_mobile_cache_io(
          move |cache| {
            cache.invalidate_blob(&universal_id_for_cache, &key);
            Ok(())
          },
          "Failed to invalidate mobile blob cache entry",
        )
        .await?;
    }
    Ok(())
  }

  pub async fn delete_blob(&self, universal_id: String, key: String, permanently: bool) -> Result<()> {
    self
      .inner
      .get(universal_id.clone())
      .await?
      .delete_blob(key.clone(), permanently)
      .await?;
    #[cfg(any(target_os = "android", target_os = "ios", test))]
    {
      let universal_id_for_cache = universal_id;
      self
        .run_mobile_cache_io(
          move |cache| {
            cache.invalidate_blob(&universal_id_for_cache, &key);
            Ok(())
          },
          "Failed to invalidate mobile blob cache entry",
        )
        .await?;
    }
    Ok(())
  }

  pub async fn release_blobs(&self, universal_id: String) -> Result<()> {
    self.inner.get(universal_id.clone()).await?.release_blobs().await?;
    #[cfg(any(target_os = "android", target_os = "ios", test))]
    {
      let universal_id_for_cache = universal_id;
      self
        .run_mobile_cache_io(
          move |cache| {
            cache.clear_workspace_cache(&universal_id_for_cache);
            Ok(())
          },
          "Failed to clear mobile blob cache workspace",
        )
        .await?;
    }
    Ok(())
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

#[cfg(test)]
mod tests {
  use std::{
    fs,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
  };

  use super::*;

  static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

  fn unique_id(prefix: &str) -> String {
    let counter = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
    let now = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("system clock before unix epoch")
      .as_nanos();
    format!("{prefix}-{now}-{counter}")
  }

  #[test]
  fn doc_update_roundtrip_base64() {
    let timestamp = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(1_700_000_000_000)
      .unwrap()
      .naive_utc();
    let original = affine_nbstore::DocUpdate {
      doc_id: "doc-1".to_string(),
      timestamp,
      bin: vec![1, 2, 3, 4, 5],
    };

    let encoded: DocUpdate = original.into();
    let decoded = affine_nbstore::DocUpdate::try_from(encoded).unwrap();

    assert_eq!(decoded.doc_id, "doc-1");
    assert_eq!(decoded.timestamp, timestamp);
    assert_eq!(decoded.bin, vec![1, 2, 3, 4, 5]);
  }

  #[test]
  fn doc_update_rejects_invalid_base64() {
    let update = DocUpdate {
      doc_id: "doc-2".to_string(),
      timestamp: 0,
      bin: "not-base64!!".to_string(),
    };

    let err = match affine_nbstore::DocUpdate::try_from(update) {
      Ok(_) => panic!("expected base64 decode error"),
      Err(err) => err,
    };
    match err {
      UniffiError::Base64DecodingError(_) => {}
      other => panic!("unexpected error: {other:?}"),
    }
  }

  #[tokio::test]
  async fn encode_large_doc_payload_returns_file_token_and_decodes_back() {
    let pool = new_doc_storage_pool();
    let universal_id = unique_id("mobile-doc-token");
    pool
      .connect(universal_id.clone(), ":memory:".to_string())
      .await
      .expect("connect should succeed");

    let data = vec![7_u8; MOBILE_BLOB_INLINE_THRESHOLD_BYTES + 16];
    let encoded = pool
      .encode_doc_data(&universal_id, "doc", 42, &data)
      .await
      .expect("encode should succeed");
    assert!(encoded.starts_with(mobile_blob_cache::MOBILE_DOC_FILE_PREFIX));

    let decoded = pool
      .decode_mobile_data(&universal_id, &encoded)
      .await
      .expect("decode should succeed");
    assert_eq!(decoded, data);

    pool.disconnect(universal_id).await.expect("disconnect should succeed");
  }

  #[tokio::test]
  async fn decode_mobile_data_rejects_out_of_workspace_path() {
    let pool = new_doc_storage_pool();
    let universal_id = unique_id("mobile-doc-outside");
    pool
      .connect(universal_id.clone(), ":memory:".to_string())
      .await
      .expect("connect should succeed");

    let outside_dir = std::env::temp_dir().join(unique_id("mobile-doc-outside-dir"));
    fs::create_dir_all(&outside_dir).expect("create outside dir");
    let outside_file = outside_dir.join("1234567890abcdef.blob");
    fs::write(&outside_file, b"outside").expect("write outside file");
    let token = format!(
      "{}{}",
      mobile_blob_cache::MOBILE_BLOB_FILE_PREFIX,
      outside_file.display()
    );

    let err = pool
      .decode_mobile_data(&universal_id, &token)
      .await
      .expect_err("decode should reject out-of-workspace token");
    let UniffiError::Err(message) = err else {
      panic!("unexpected error kind");
    };
    assert!(message.contains("outside the workspace cache directory"));

    pool.disconnect(universal_id).await.expect("disconnect should succeed");
    let _ = fs::remove_dir_all(outside_dir);
  }
}
