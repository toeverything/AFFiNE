use std::path::{Path, PathBuf};

use affine_doc_loader::ParseError;
use assert_json_diff::assert_json_eq;
use chrono::Utc;
use serde_json::Value;
use tokio::fs;
use uuid::Uuid;

use super::{
  super::{DocIndexedClock, error::Error, storage::SqliteDocStorage},
  NativeIndexDocument, NativeIndexField, NativeIndexQuery, NativeIndexSearchOptions,
};

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

fn query(kind: &str, field: Option<&str>, value: Option<&str>) -> NativeIndexQuery {
  NativeIndexQuery {
    kind: kind.into(),
    field: field.map(Into::into),
    value: value.map(Into::into),
    occur: None,
    clauses: None,
    boost: None,
  }
}

fn options(fields: &[&str], highlights: &[&str]) -> NativeIndexSearchOptions {
  NativeIndexSearchOptions {
    limit: 10,
    offset: 0,
    fields: fields.iter().map(|value| (*value).into()).collect(),
    highlights: highlights.iter().map(|value| (*value).into()).collect(),
  }
}

fn document(id: &str, fields: &[(&str, &[&str])]) -> NativeIndexDocument {
  NativeIndexDocument {
    id: id.into(),
    fields: fields
      .iter()
      .map(|(field, values)| NativeIndexField {
        field: (*field).into(),
        values: values.iter().map(|value| (*value).into()).collect(),
      })
      .collect(),
  }
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
  sqlx::query(r#"INSERT INTO updates (doc_id, data, created_at) VALUES (?, ?, ?)"#)
    .bind("demo-doc")
    .bind(&[0, 0][..])
    .bind(Utc::now().naive_utc())
    .execute(&storage.pool)
    .await
    .unwrap();
  let result = storage.crawl_doc_data("demo-doc").await.unwrap();
  let mut expected: Value = serde_json::from_slice(DEMO_JSON).unwrap();
  let mut actual = serde_json::to_value(&result).unwrap();
  for document in [&mut expected, &mut actual] {
    for block in document["blocks"].as_array_mut().unwrap() {
      if let Some(additional) = block["additional"].as_str() {
        block["additional"] = serde_json::from_str(additional).unwrap();
      }
    }
  }
  assert_json_eq!(expected, actual);
  storage.close().await;
  cleanup(&db_path).await;
}

#[tokio::test]
async fn missing_doc_returns_error() {
  let db_path = temp_workspace_dir().join("storage.db");
  let storage = init_db(&db_path).await;
  let error = storage.crawl_doc_data("absent-doc").await.unwrap_err();
  assert!(matches!(error, Error::Parse(ParseError::DocNotFound)));
  storage.close().await;
  cleanup(&db_path).await;
}

#[tokio::test]
async fn index_tables_support_terminal_queries_and_restart() {
  let db_path = temp_workspace_dir().join("storage.db");
  let storage = init_db(&db_path).await;
  storage
    .index_upsert(
      "doc",
      document(
        "doc-1",
        &[
          ("docId", &["doc-1"]),
          ("title", &["Rust 搜索"]),
          ("summary", &["stored summary"]),
        ],
      ),
    )
    .await
    .unwrap();
  storage
    .index_upsert(
      "block",
      document(
        "block-1",
        &[
          ("docId", &["doc-1"]),
          ("blockId", &["block-1"]),
          ("content", &["hello world", "你好搜索"]),
          ("flavour", &["affine:paragraph"]),
        ],
      ),
    )
    .await
    .unwrap();
  storage
    .index_upsert(
      "block",
      document(
        "block-2",
        &[
          ("docId", &["doc-10"]),
          ("blockId", &["block-2"]),
          ("content", &["hello unrelated"]),
          ("flavour", &["affine:code"]),
        ],
      ),
    )
    .await
    .unwrap();

  let text = storage
    .index_search(
      "block",
      query("match", Some("content"), Some("搜索")),
      options(&["content"], &["content"]),
    )
    .await
    .unwrap();
  assert_eq!(text.total, 1);
  assert_eq!(text.hits[0].id, "block-1");
  assert!(!text.hits[0].highlights[0].values[0].spans.is_empty());

  let exact = storage
    .index_search(
      "block",
      query("match", Some("docId"), Some("doc-1")),
      options(&["docId"], &[]),
    )
    .await
    .unwrap();
  assert_eq!(exact.total, 1);
  assert_eq!(exact.hits[0].fields[0].values, ["doc-1"]);

  let aggregate = storage
    .index_aggregate(
      "block",
      query("all", None, None),
      "flavour",
      10,
      0,
      Some(options(&["blockId"], &[])),
    )
    .await
    .unwrap();
  assert_eq!(aggregate.total, 2);
  assert_eq!(aggregate.buckets.len(), 2);

  let clock = DocIndexedClock {
    doc_id: "doc-1".into(),
    timestamp: Utc::now().naive_utc(),
    indexer_version: SqliteDocStorage::index_version() as i64,
  };
  storage.commit_indexed_clocks(&[clock]).await.unwrap();
  storage.close().await;

  let restored = init_db(&db_path).await;
  let result = restored
    .index_search(
      "block",
      query("match", Some("content"), Some("hello")),
      options(&[], &[]),
    )
    .await
    .unwrap();
  assert_eq!(result.total, 2);
  assert_eq!(
    restored
      .index_delete_by_query("block", query("match", Some("docId"), Some("doc-1")))
      .await
      .unwrap(),
    1
  );
  restored.close().await;
  cleanup(&db_path).await;
}

#[tokio::test]
async fn corrupt_checkpoint_requires_rebuild_and_clears_clocks() {
  let db_path = temp_workspace_dir().join("storage.db");
  let storage = init_db(&db_path).await;
  storage
    .index_upsert(
      "doc",
      document("doc-1", &[("docId", &["doc-1"]), ("title", &["title"])]),
    )
    .await
    .unwrap();
  let clock = DocIndexedClock {
    doc_id: "doc-1".into(),
    timestamp: Utc::now().naive_utc(),
    indexer_version: SqliteDocStorage::index_version() as i64,
  };
  storage.commit_indexed_clocks(&[clock]).await.unwrap();
  sqlx::query("UPDATE idx_snapshots SET data = x'00' WHERE index_name = 'doc'")
    .execute(&storage.pool)
    .await
    .unwrap();
  storage.close().await;

  let restored = init_db(&db_path).await;
  assert!(matches!(
    restored
      .index_search("doc", query("all", None, None), options(&[], &[]))
      .await,
    Err(Error::IndexNotReady)
  ));
  assert!(restored.get_doc_indexed_clock("doc-1".into()).await.unwrap().is_none());
  restored
    .index_upsert(
      "doc",
      document("doc-1", &[("docId", &["doc-1"]), ("title", &["rebuilt"])]),
    )
    .await
    .unwrap();
  restored
    .commit_indexed_clocks(&[DocIndexedClock {
      doc_id: "doc-1".into(),
      timestamp: Utc::now().naive_utc(),
      indexer_version: SqliteDocStorage::index_version() as i64,
    }])
    .await
    .unwrap();
  assert_eq!(
    restored
      .index_search("doc", query("all", None, None), options(&[], &[]))
      .await
      .unwrap()
      .total,
    1
  );
  restored.close().await;
  cleanup(&db_path).await;
}

#[tokio::test]
async fn failed_atomic_commit_keeps_index_dirty_and_clock_unadvanced() {
  let db_path = temp_workspace_dir().join("storage.db");
  let storage = init_db(&db_path).await;
  storage
    .index_upsert(
      "doc",
      document("doc-1", &[("docId", &["doc-1"]), ("title", &["title"])]),
    )
    .await
    .unwrap();
  sqlx::query("DROP TABLE idx_snapshots")
    .execute(&storage.pool)
    .await
    .unwrap();
  let clock = DocIndexedClock {
    doc_id: "doc-1".into(),
    timestamp: Utc::now().naive_utc(),
    indexer_version: SqliteDocStorage::index_version() as i64,
  };
  assert!(storage.commit_indexed_clocks(&[clock]).await.is_err());
  assert!(
    storage
      .indexes
      .table("doc")
      .unwrap()
      .index
      .read()
      .await
      .has_unpersisted_changes()
  );
  assert!(storage.get_doc_indexed_clock("doc-1".into()).await.unwrap().is_none());
  storage.close().await;
  cleanup(&db_path).await;
}
