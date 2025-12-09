mod memory_indexer;
mod tokenizer;
mod types;

use affine_common::doc_parser::{parse_doc_from_binary, ParseError};
pub use memory_indexer::InMemoryIndex;
use sqlx::Row;
pub use types::{
  DocData, NativeBlockInfo, NativeCrawlResult, NativeMatch, NativeSearchHit, SnapshotData,
};
use y_octo::DocOptions;

use super::{
  error::{Error, Result},
  storage::SqliteDocStorage,
};

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

  pub async fn init_index(&self) -> Result<()> {
    let snapshots = sqlx::query("SELECT index_name, data FROM idx_snapshots")
      .fetch_all(&self.pool)
      .await?;

    {
      let mut index = self.index.write().await;
      for row in snapshots {
        let index_name: String = row.get("index_name");
        let data: Vec<u8> = row.get("data");
        if let Ok(decompressed) = zstd::stream::decode_all(std::io::Cursor::new(&data)) {
          if let Ok((snapshot, _)) = bincode::serde::decode_from_slice::<SnapshotData, _>(
            &decompressed,
            bincode::config::standard(),
          ) {
            index.load_snapshot(&index_name, snapshot);
          }
        }
      }
    }

    Ok(())
  }

  async fn compact_index(&self, index_name: &str) -> Result<()> {
    let snapshot_data = {
      let index = self.index.read().await;
      index.get_snapshot_data(index_name)
    };

    if let Some(data) = snapshot_data {
      let blob = bincode::serde::encode_to_vec(&data, bincode::config::standard())
        .map_err(|e| Error::Serialization(e.to_string()))?;
      let compressed = zstd::stream::encode_all(std::io::Cursor::new(&blob), 0)
        .map_err(|e| Error::Serialization(e.to_string()))?;

      let mut tx = self.pool.begin().await?;

      sqlx::query("INSERT OR REPLACE INTO idx_snapshots (index_name, data) VALUES (?, ?)")
        .bind(index_name)
        .bind(compressed)
        .execute(&mut *tx)
        .await?;

      tx.commit().await?;
    }
    Ok(())
  }

  pub async fn flush_index(&self) -> Result<()> {
    let (dirty_docs, deleted_docs) = {
      let mut index = self.index.write().await;
      index.take_dirty_and_deleted()
    };

    if dirty_docs.is_empty() && deleted_docs.is_empty() {
      return Ok(());
    }

    let mut modified_indices = std::collections::HashSet::new();
    for index_name in deleted_docs.keys() {
      modified_indices.insert(index_name.clone());
    }
    for (index_name, _, _, _) in &dirty_docs {
      modified_indices.insert(index_name.clone());
    }

    for index_name in modified_indices {
      self.compact_index(&index_name).await?;
    }

    Ok(())
  }

  pub async fn fts_add(
    &self,
    index_name: &str,
    doc_id: &str,
    text: &str,
    index: bool,
  ) -> Result<()> {
    let mut idx = self.index.write().await;
    idx.add_doc(index_name, doc_id, text, index);
    Ok(())
  }

  pub async fn fts_delete(&self, index_name: &str, doc_id: &str) -> Result<()> {
    let mut idx = self.index.write().await;
    idx.remove_doc(index_name, doc_id);
    Ok(())
  }

  pub async fn fts_get(&self, index_name: &str, doc_id: &str) -> Result<Option<String>> {
    let idx = self.index.read().await;
    Ok(idx.get_doc(index_name, doc_id))
  }

  pub async fn fts_search(&self, index_name: &str, query: &str) -> Result<Vec<NativeSearchHit>> {
    let idx = self.index.read().await;
    Ok(
      idx
        .search(index_name, query)
        .into_iter()
        .map(|(id, score)| NativeSearchHit { id, score })
        .collect(),
    )
  }

  pub async fn fts_get_matches(
    &self,
    index_name: &str,
    doc_id: &str,
    query: &str,
  ) -> Result<Vec<NativeMatch>> {
    let idx = self.index.read().await;
    Ok(
      idx
        .get_matches(index_name, doc_id, query)
        .into_iter()
        .map(|(start, end)| NativeMatch { start, end })
        .collect(),
    )
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

  const DEMO_BIN: &[u8] = include_bytes!("../../../../../common/native/fixtures/demo.ydoc");
  const DEMO_JSON: &[u8] = include_bytes!("../../../../../common/native/fixtures/demo.ydoc.json");

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
