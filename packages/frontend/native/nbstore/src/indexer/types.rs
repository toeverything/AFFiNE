use std::collections::HashMap;

use affine_common::doc_parser::{BlockInfo, CrawlResult};
use napi_derive::napi;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocData {
  pub content: String,
  pub doc_len: i64,
  pub term_pos: HashMap<String, Vec<(u32, u32)>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SnapshotData {
  pub docs: HashMap<String, DocData>,
}

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

#[napi(object)]
#[derive(Debug, Serialize)]
pub struct NativeCrawlResult {
  pub blocks: Vec<NativeBlockInfo>,
  pub title: String,
  pub summary: String,
}

#[napi(object)]
#[derive(Debug, Serialize)]
pub struct NativeSearchHit {
  pub id: String,
  pub score: f64,
}

#[napi(object)]
#[derive(Debug, Serialize)]
pub struct NativeMatch {
  pub start: u32,
  pub end: u32,
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

impl From<CrawlResult> for NativeCrawlResult {
  fn from(value: CrawlResult) -> Self {
    Self {
      blocks: value.blocks.into_iter().map(Into::into).collect(),
      title: value.title,
      summary: value.summary,
    }
  }
}
