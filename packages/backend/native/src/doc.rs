use affine_common::doc_parser::{self, BlockInfo, CrawlResult, MarkdownResult};
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct NativeMarkdownResult {
  pub title: String,
  pub markdown: String,
}

impl From<MarkdownResult> for NativeMarkdownResult {
  fn from(result: MarkdownResult) -> Self {
    Self {
      title: result.title,
      markdown: result.markdown,
    }
  }
}

#[napi(object)]
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
  fn from(info: BlockInfo) -> Self {
    Self {
      block_id: info.block_id,
      flavour: info.flavour,
      content: info.content,
      blob: info.blob,
      ref_doc_id: info.ref_doc_id,
      ref_info: info.ref_info,
      parent_flavour: info.parent_flavour,
      parent_block_id: info.parent_block_id,
      additional: info.additional,
    }
  }
}

#[napi(object)]
pub struct NativeCrawlResult {
  pub blocks: Vec<NativeBlockInfo>,
  pub title: String,
  pub summary: String,
}

impl From<CrawlResult> for NativeCrawlResult {
  fn from(result: CrawlResult) -> Self {
    Self {
      blocks: result.blocks.into_iter().map(Into::into).collect(),
      title: result.title,
      summary: result.summary,
    }
  }
}

#[napi]
pub fn parse_doc_from_binary(doc_bin: Buffer, doc_id: String) -> Result<NativeCrawlResult> {
  let result = doc_parser::parse_doc_from_binary(doc_bin.into(), doc_id)
    .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
  Ok(result.into())
}

#[napi]
pub fn parse_doc_to_markdown(
  doc_bin: Buffer,
  doc_id: String,
  ai_editable: Option<bool>,
) -> Result<NativeMarkdownResult> {
  let result =
    doc_parser::parse_doc_to_markdown(doc_bin.into(), doc_id, ai_editable.unwrap_or(false))
      .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
  Ok(result.into())
}

#[napi]
pub fn read_all_doc_ids_from_root_doc(
  doc_bin: Buffer,
  include_trash: Option<bool>,
) -> Result<Vec<String>> {
  let result = doc_parser::get_doc_ids_from_binary(doc_bin.into(), include_trash.unwrap_or(false))
    .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
  Ok(result)
}
