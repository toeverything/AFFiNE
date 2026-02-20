mod blobs;
mod docs;
mod indexer;
mod lifecycle;
mod peers;

#[cfg(any(target_os = "android", target_os = "ios", test))]
use std::sync::Arc;

use affine_nbstore::{
  Data, DocRecord as NbDocRecord, SetBlob as NbSetBlob, pool::SqliteDocStoragePool, storage::SqliteDocStorage,
};
use chrono::{DateTime, NaiveDateTime, Utc};

#[cfg(any(target_os = "android", target_os = "ios", test))]
use crate::cache::{MobileBlobCache, is_mobile_binary_file_token, should_cache_payload_as_file};
use crate::{
  Blob, CrawlResult, DocClock, DocRecord, DocUpdate, ListedBlob, MatchRange, Result, SearchHit, SetBlob, UniffiError,
  payload_codec::{decode_base64_data, encode_base64_data},
};

fn millis_to_naive_utc(millis: i64) -> Result<NaiveDateTime> {
  DateTime::<Utc>::from_timestamp_millis(millis)
    .ok_or(UniffiError::TimestampDecodingError)
    .map(|value| value.naive_utc())
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
  pub(crate) async fn decode_mobile_data(&self, universal_id: &str, data: &str) -> Result<Vec<u8>> {
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

  pub(crate) async fn encode_doc_data(
    &self,
    universal_id: &str,
    doc_id: &str,
    timestamp: i64,
    data: &[u8],
  ) -> Result<String> {
    #[cfg(any(target_os = "android", target_os = "ios", test))]
    if should_cache_payload_as_file(data.len()) {
      enum DocEncodeOutcome {
        CachedToken(String),
        Inline(Vec<u8>),
      }

      let universal_id = universal_id.to_string();
      let doc_id = doc_id.to_string();
      let data = data.to_vec();
      match self
        .run_mobile_cache_io(
          move |cache| {
            Ok(match cache.cache_doc_bin(&universal_id, &doc_id, timestamp, &data) {
              Ok(token) => DocEncodeOutcome::CachedToken(token),
              Err(_) => DocEncodeOutcome::Inline(data),
            })
          },
          "Failed to cache doc file",
        )
        .await
      {
        Ok(DocEncodeOutcome::CachedToken(token)) => return Ok(token),
        Ok(DocEncodeOutcome::Inline(data)) => return Ok(encode_base64_data(&data)),
        Err(_) => {}
      }
    }
    #[cfg(not(any(target_os = "android", target_os = "ios", test)))]
    let _ = (universal_id, doc_id, timestamp);

    Ok(encode_base64_data(data))
  }
}
