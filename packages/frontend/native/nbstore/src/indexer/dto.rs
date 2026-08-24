use affine_doc_loader::{BlockInfo, CrawlResult};
use napi_derive::napi;
use serde::{Deserialize, Serialize};

#[napi(object)]
#[derive(Debug, Serialize)]
pub struct NativeBlockInfo {
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

impl From<BlockInfo> for NativeBlockInfo {
  fn from(value: BlockInfo) -> Self {
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

#[napi(object)]
#[derive(Debug, Serialize)]
pub struct NativeCrawlResult {
  pub blocks: Vec<NativeBlockInfo>,
  pub title: String,
  pub summary: String,
}

impl From<CrawlResult> for NativeCrawlResult {
  fn from(value: CrawlResult) -> Self {
    Self {
      blocks: value.blocks.into_iter().map(Into::into).collect(),
      title: value.title,
      summary: value.summary,
    }
  }
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeIndexField {
  pub field: String,
  pub values: Vec<String>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeIndexDocument {
  pub id: String,
  pub fields: Vec<NativeIndexField>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeIndexQuery {
  pub kind: String,
  pub field: Option<String>,
  pub value: Option<String>,
  pub occur: Option<String>,
  pub clauses: Option<Vec<NativeIndexQuery>>,
  pub boost: Option<f64>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeIndexSearchOptions {
  pub limit: u32,
  pub offset: u32,
  pub fields: Vec<String>,
  pub highlights: Vec<String>,
}

#[napi(object)]
#[derive(Debug, Serialize)]
pub struct NativeIndexSpan {
  pub start: u32,
  pub end: u32,
}

#[napi(object)]
#[derive(Debug, Serialize)]
pub struct NativeIndexHighlightValue {
  pub value_index: u32,
  pub spans: Vec<NativeIndexSpan>,
}

#[napi(object)]
#[derive(Debug, Serialize)]
pub struct NativeIndexHighlight {
  pub field: String,
  pub values: Vec<NativeIndexHighlightValue>,
}

#[napi(object)]
#[derive(Debug, Serialize)]
pub struct NativeIndexHit {
  pub id: String,
  pub score: f64,
  pub fields: Vec<NativeIndexField>,
  pub highlights: Vec<NativeIndexHighlight>,
}

#[napi(object)]
#[derive(Debug, Serialize)]
pub struct NativeIndexSearchResult {
  pub total: u32,
  pub hits: Vec<NativeIndexHit>,
}

#[napi(object)]
#[derive(Debug, Serialize)]
pub struct NativeIndexBucket {
  pub key: String,
  pub count: u32,
  pub score: f64,
  pub hits: Vec<NativeIndexHit>,
}

#[napi(object)]
#[derive(Debug, Serialize)]
pub struct NativeIndexAggregateResult {
  pub total: u32,
  pub buckets: Vec<NativeIndexBucket>,
}
