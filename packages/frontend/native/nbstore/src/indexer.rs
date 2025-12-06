use affine_common::doc_parser::{parse_doc_from_binary, BlockInfo, CrawlResult, ParseError};
use napi_derive::napi;
use serde::Serialize;
use y_octo::DocOptions;

use super::{error::Result, storage::SqliteDocStorage};

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

impl SqliteDocStorage {
  pub async fn crawl_doc_data(&self, doc_id: &str) -> Result<NativeCrawlResult> {
    let doc_bin = self
      .load_doc_binary(doc_id)
      .await?
      .ok_or(ParseError::DocNotFound)?;

    let result = parse_doc_from_binary(doc_bin, doc_id.to_string())?;
    Ok(result.into())
  }

  async fn load_doc_binary(&self, doc_id: &str) -> Result<Option<Vec<u8>>> {
    let snapshot = self.get_doc_snapshot(doc_id.to_string()).await?;
    let mut updates = self.get_doc_updates(doc_id.to_string()).await?;

    if snapshot.is_none() && updates.is_empty() {
      return Ok(None);
    }

    updates.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    let mut segments =
      Vec::with_capacity(snapshot.as_ref().map(|_| 1).unwrap_or(0) + updates.len());
    if let Some(record) = snapshot {
      segments.push(record.bin.to_vec());
    }
    segments.extend(updates.into_iter().map(|update| update.bin.to_vec()));

    merge_updates(segments, doc_id).map(Some)
  }
}

fn merge_updates(mut segments: Vec<Vec<u8>>, guid: &str) -> Result<Vec<u8>> {
  if segments.is_empty() {
    return Err(ParseError::DocNotFound.into());
  }

  if segments.len() == 1 {
    return segments.pop().ok_or(ParseError::DocNotFound.into());
  }

  let mut doc = DocOptions::new().with_guid(guid.to_string()).build();
  for update in segments.iter() {
    doc
      .apply_update_from_binary_v1(update)
      .map_err(|_| ParseError::InvalidBinary)?;
  }

  let buffer = doc
    .encode_update_v1()
    .map_err(|err| ParseError::ParserError(err.to_string()))?;

  Ok(buffer)
}

#[cfg(test)]
mod tests {
  use std::path::{Path, PathBuf};

  use affine_common::doc_parser::ParseError;
  use chrono::Utc;
  use serde_json::Value;
  use tokio::fs;
  use uuid::Uuid;

  use super::{super::error::Error, *};

  const DEMO_BIN: &[u8] = include_bytes!("../../../../common/native/fixtures/demo.ydoc");
  const DEMO_JSON: &[u8] = include_bytes!("../../../../common/native/fixtures/demo.ydoc.json");

  fn temp_workspace_dir() -> PathBuf {
    std::env::temp_dir().join(format!("affine-native-{}", Uuid::new_v4()))
  }

  async fn init_db(path: &Path) -> SqliteDocStorage {
    fs::create_dir_all(path.parent().unwrap()).await.unwrap();
    let storage = SqliteDocStorage::new(path.to_string_lossy().into_owned());
    storage.connect().await.unwrap();
    storage
  }

  async fn cleanup(path: &Path) {
    let _ = fs::remove_dir_all(path.parent().unwrap()).await;
  }

  #[tokio::test]
  async fn parse_demo_snapshot_matches_fixture() {
    let base = temp_workspace_dir();
    fs::create_dir_all(&base).await.unwrap();
    let db_path = base.join("storage.db");

    let storage = init_db(&db_path).await;
    sqlx::query(r#"INSERT INTO snapshots (doc_id, data, updated_at) VALUES (?, ?, ?)"#)
      .bind("demo-doc")
      .bind(DEMO_BIN)
      .bind(Utc::now().naive_utc())
      .execute(&storage.pool)
      .await
      .unwrap();

    let result = storage.crawl_doc_data("demo-doc").await.unwrap();

    let expected: Value = serde_json::from_slice(DEMO_JSON).unwrap();
    let actual = serde_json::to_value(&result).unwrap();
    assert_eq!(expected, actual);

    storage.close().await;
    cleanup(&db_path).await;
  }

  #[tokio::test]
  async fn missing_doc_returns_error() {
    let base = temp_workspace_dir();
    fs::create_dir_all(&base).await.unwrap();
    let db_path = base.join("storage.db");

    let storage = init_db(&db_path).await;

    let err = storage.crawl_doc_data("absent-doc").await.unwrap_err();
    assert!(matches!(err, Error::Parse(ParseError::DocNotFound)));

    storage.close().await;
    cleanup(&db_path).await;
  }
}
