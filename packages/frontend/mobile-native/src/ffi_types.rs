use affine_nbstore::{
  Blob as NbBlob, Data, DocClock as NbDocClock, DocIndexedClock as NbDocIndexedClock, DocRecord as NbDocRecord,
  DocUpdate as NbDocUpdate, ListedBlob as NbListedBlob, SetBlob as NbSetBlob,
  indexer::{
    NativeBlockInfo, NativeCrawlResult, NativeIndexAggregateResult, NativeIndexBucket, NativeIndexField,
    NativeIndexHighlight, NativeIndexHighlightValue, NativeIndexHit, NativeIndexSearchResult, NativeIndexSpan,
  },
};
use chrono::{DateTime, Utc};

use crate::{
  Result, UniffiError,
  payload_codec::{decode_base64_data, encode_base64_data},
};

#[derive(uniffi::Record)]
pub struct DocRecord {
  pub doc_id: String,
  // base64 encoded data
  pub bin: String,
  pub timestamp: i64,
}

impl From<NbDocRecord> for DocRecord {
  fn from(record: NbDocRecord) -> Self {
    Self {
      doc_id: record.doc_id,
      bin: encode_base64_data(&record.bin),
      timestamp: record.timestamp.and_utc().timestamp_millis(),
    }
  }
}

impl TryFrom<DocRecord> for NbDocRecord {
  type Error = UniffiError;

  fn try_from(record: DocRecord) -> Result<Self> {
    Ok(Self {
      doc_id: record.doc_id,
      bin: Into::<Data>::into(decode_base64_data(&record.bin)?),
      timestamp: DateTime::<Utc>::from_timestamp_millis(record.timestamp)
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

impl From<NbDocUpdate> for DocUpdate {
  fn from(update: NbDocUpdate) -> Self {
    Self {
      doc_id: update.doc_id,
      timestamp: update.timestamp.and_utc().timestamp_millis(),
      bin: encode_base64_data(&update.bin),
    }
  }
}

impl TryFrom<DocUpdate> for NbDocUpdate {
  type Error = UniffiError;

  fn try_from(update: DocUpdate) -> Result<Self> {
    Ok(Self {
      doc_id: update.doc_id,
      timestamp: DateTime::<Utc>::from_timestamp_millis(update.timestamp)
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

#[derive(uniffi::Record)]
pub struct DocIndexedClock {
  pub doc_id: String,
  pub timestamp: i64,
  pub indexer_version: i64,
}

impl From<NbDocIndexedClock> for DocIndexedClock {
  fn from(clock: NbDocIndexedClock) -> Self {
    Self {
      doc_id: clock.doc_id,
      timestamp: clock.timestamp.and_utc().timestamp_millis(),
      indexer_version: clock.indexer_version,
    }
  }
}

impl TryFrom<DocIndexedClock> for NbDocIndexedClock {
  type Error = UniffiError;

  fn try_from(clock: DocIndexedClock) -> Result<Self> {
    Ok(Self {
      doc_id: clock.doc_id,
      timestamp: DateTime::<Utc>::from_timestamp_millis(clock.timestamp)
        .ok_or(UniffiError::TimestampDecodingError)?
        .naive_utc(),
      indexer_version: clock.indexer_version,
    })
  }
}

impl From<NbDocClock> for DocClock {
  fn from(clock: NbDocClock) -> Self {
    Self {
      doc_id: clock.doc_id,
      timestamp: clock.timestamp.and_utc().timestamp_millis(),
    }
  }
}

impl TryFrom<DocClock> for NbDocClock {
  type Error = UniffiError;

  fn try_from(clock: DocClock) -> Result<Self> {
    Ok(Self {
      doc_id: clock.doc_id,
      timestamp: DateTime::<Utc>::from_timestamp_millis(clock.timestamp)
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

impl From<NbBlob> for Blob {
  fn from(blob: NbBlob) -> Self {
    Self {
      key: blob.key,
      data: encode_base64_data(&blob.data),
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

impl TryFrom<SetBlob> for NbSetBlob {
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

impl From<NbListedBlob> for ListedBlob {
  fn from(blob: NbListedBlob) -> Self {
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

impl From<NativeBlockInfo> for BlockInfo {
  fn from(value: NativeBlockInfo) -> Self {
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

impl From<NativeCrawlResult> for CrawlResult {
  fn from(value: NativeCrawlResult) -> Self {
    Self {
      blocks: value.blocks.into_iter().map(Into::into).collect(),
      title: value.title,
      summary: value.summary,
    }
  }
}

#[derive(uniffi::Record)]
pub struct IndexField {
  pub field: String,
  pub values: Vec<String>,
}

impl From<NativeIndexField> for IndexField {
  fn from(value: NativeIndexField) -> Self {
    Self {
      field: value.field,
      values: value.values,
    }
  }
}

#[derive(uniffi::Record)]
pub struct IndexSpan {
  pub start: u32,
  pub end: u32,
}

impl From<NativeIndexSpan> for IndexSpan {
  fn from(value: NativeIndexSpan) -> Self {
    Self {
      start: value.start,
      end: value.end,
    }
  }
}

#[derive(uniffi::Record)]
pub struct IndexHighlightValue {
  pub value_index: u32,
  pub spans: Vec<IndexSpan>,
}

impl From<NativeIndexHighlightValue> for IndexHighlightValue {
  fn from(value: NativeIndexHighlightValue) -> Self {
    Self {
      value_index: value.value_index,
      spans: value.spans.into_iter().map(Into::into).collect(),
    }
  }
}

#[derive(uniffi::Record)]
pub struct IndexHighlight {
  pub field: String,
  pub values: Vec<IndexHighlightValue>,
}

impl From<NativeIndexHighlight> for IndexHighlight {
  fn from(value: NativeIndexHighlight) -> Self {
    Self {
      field: value.field,
      values: value.values.into_iter().map(Into::into).collect(),
    }
  }
}

#[derive(uniffi::Record)]
pub struct IndexHit {
  pub id: String,
  pub score: f64,
  pub fields: Vec<IndexField>,
  pub highlights: Vec<IndexHighlight>,
}

impl From<NativeIndexHit> for IndexHit {
  fn from(value: NativeIndexHit) -> Self {
    Self {
      id: value.id,
      score: value.score,
      fields: value.fields.into_iter().map(Into::into).collect(),
      highlights: value.highlights.into_iter().map(Into::into).collect(),
    }
  }
}

#[derive(uniffi::Record)]
pub struct IndexSearchResult {
  pub total: u32,
  pub hits: Vec<IndexHit>,
}

impl From<NativeIndexSearchResult> for IndexSearchResult {
  fn from(value: NativeIndexSearchResult) -> Self {
    Self {
      total: value.total,
      hits: value.hits.into_iter().map(Into::into).collect(),
    }
  }
}

#[derive(uniffi::Record)]
pub struct IndexBucket {
  pub key: String,
  pub count: u32,
  pub score: f64,
  pub hits: Vec<IndexHit>,
}

impl From<NativeIndexBucket> for IndexBucket {
  fn from(value: NativeIndexBucket) -> Self {
    Self {
      key: value.key,
      count: value.count,
      score: value.score,
      hits: value.hits.into_iter().map(Into::into).collect(),
    }
  }
}

#[derive(uniffi::Record)]
pub struct IndexAggregateResult {
  pub total: u32,
  pub buckets: Vec<IndexBucket>,
}

impl From<NativeIndexAggregateResult> for IndexAggregateResult {
  fn from(value: NativeIndexAggregateResult) -> Self {
    Self {
      total: value.total,
      buckets: value.buckets.into_iter().map(Into::into).collect(),
    }
  }
}
