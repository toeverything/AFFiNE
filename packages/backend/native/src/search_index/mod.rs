mod document;
mod query;
mod result;
mod schema;

use std::sync::Arc;

use memory_indexer::{MemoryIndex, Mutation, TermsAggregation};
use napi::{Status, bindgen_prelude::Buffer};
use serde_json::Value as JsonValue;
use tokio::sync::RwLock;

use self::{
  document::compile_document,
  query::{compile_options, compile_query},
  result::{HighlightTags, aggregate_result, search_result},
  schema::TableSchema,
};

type Result<T> = std::result::Result<T, IndexError>;

#[derive(Debug, thiserror::Error)]
enum IndexError {
  #[error("Invalid index input: {0}")]
  InvalidInput(String),
  #[error(transparent)]
  Memory(#[from] memory_indexer::Error),
  #[error(transparent)]
  Json(#[from] serde_json::Error),
}

impl From<IndexError> for napi::Error {
  fn from(error: IndexError) -> Self {
    napi::Error::new(Status::InvalidArg, error.to_string())
  }
}

struct TableIndex {
  schema: TableSchema,
  index: RwLock<MemoryIndex>,
}

impl TableIndex {
  fn new(schema: TableSchema) -> Self {
    Self {
      index: RwLock::new(MemoryIndex::new(schema.schema.clone())),
      schema,
    }
  }
}

struct IndexManager {
  doc: TableIndex,
  block: TableIndex,
}

impl IndexManager {
  fn new() -> Self {
    Self {
      doc: TableIndex::new(TableSchema::doc()),
      block: TableIndex::new(TableSchema::block()),
    }
  }

  fn table(&self, name: &str) -> Result<&TableIndex> {
    match name {
      "doc" => Ok(&self.doc),
      "block" => Ok(&self.block),
      _ => Err(IndexError::InvalidInput(format!("unknown index table {name}"))),
    }
  }
}

pub(crate) struct EmbeddedIndexCheckpoint {
  pub sequence: i64,
  pub data: Buffer,
}

pub(crate) struct EmbeddedSearchIndex {
  manager: Arc<IndexManager>,
}

impl EmbeddedSearchIndex {
  pub(crate) fn new() -> Self {
    Self {
      manager: Arc::new(IndexManager::new()),
    }
  }

  pub(crate) async fn restore(&self, table: String, checkpoint: Buffer) -> napi::Result<()> {
    let table = self.manager.table(&table)?;
    let index =
      MemoryIndex::from_checkpoint(table.schema.schema.clone(), checkpoint.as_ref()).map_err(IndexError::from)?;
    *table.index.write().await = index;
    Ok(())
  }

  pub(crate) async fn reset(&self, table: String) -> napi::Result<()> {
    let table = self.manager.table(&table)?;
    *table.index.write().await = MemoryIndex::new(table.schema.schema.clone());
    Ok(())
  }

  pub(crate) async fn write(&self, table: String, documents_json: String) -> napi::Result<()> {
    let table = self.manager.table(&table)?;
    let documents: Vec<JsonValue> = serde_json::from_str(&documents_json)?;
    let documents = documents
      .into_iter()
      .map(|document| compile_document(&table.schema, document))
      .collect::<Result<Vec<_>>>()?;
    table
      .index
      .write()
      .await
      .apply_batch(documents.into_iter().map(Mutation::Upsert).collect())
      .map_err(IndexError::from)?;
    Ok(())
  }

  pub(crate) async fn delete(&self, table: String, id: String) -> napi::Result<()> {
    self.manager.table(&table)?.index.write().await.delete(&id);
    Ok(())
  }

  pub(crate) async fn search(&self, table: String, dsl_json: String) -> napi::Result<String> {
    let table = self.manager.table(&table)?;
    let dsl: JsonValue = serde_json::from_str(&dsl_json)?;
    let query = compile_query(
      &table.schema,
      dsl
        .get("query")
        .ok_or_else(|| IndexError::InvalidInput("search query is required".into()))?,
    )?;
    let result = table
      .index
      .read()
      .await
      .search(&query, compile_options(&table.schema, &dsl)?)
      .map_err(IndexError::from)?;
    Ok(serde_json::to_string(&search_result(
      &table.schema,
      result,
      &highlight_tags(&dsl),
    ))?)
  }

  pub(crate) async fn aggregate(&self, table: String, dsl_json: String) -> napi::Result<String> {
    let table = self.manager.table(&table)?;
    let dsl: JsonValue = serde_json::from_str(&dsl_json)?;
    let query = compile_query(
      &table.schema,
      dsl
        .get("query")
        .ok_or_else(|| IndexError::InvalidInput("aggregate query is required".into()))?,
    )?;
    let terms = dsl
      .pointer("/aggs/result/terms")
      .ok_or_else(|| IndexError::InvalidInput("terms aggregation is required".into()))?;
    let top_hits = dsl
      .pointer("/aggs/result/aggs/result/top_hits")
      .map(|options| compile_options(&table.schema, options))
      .transpose()?;
    let limit = terms.get("size").and_then(JsonValue::as_u64).unwrap_or(10) as usize;
    let result = table
      .index
      .read()
      .await
      .aggregate(
        &query,
        TermsAggregation {
          field: table.schema.field(
            terms
              .get("field")
              .and_then(JsonValue::as_str)
              .ok_or_else(|| IndexError::InvalidInput("aggregation field is required".into()))?,
          )?,
          limit: limit.saturating_add(1),
          offset: dsl.get("from").and_then(JsonValue::as_u64).unwrap_or(0) as usize,
          top_hits,
        },
      )
      .map_err(IndexError::from)?;
    Ok(serde_json::to_string(&aggregate_result(
      &table.schema,
      result,
      limit,
      &highlight_tags(dsl.pointer("/aggs/result/aggs/result/top_hits").unwrap_or(&dsl)),
    ))?)
  }

  pub(crate) async fn checkpoint(&self, table: String) -> napi::Result<EmbeddedIndexCheckpoint> {
    let checkpoint = self
      .manager
      .table(&table)?
      .index
      .read()
      .await
      .checkpoint()
      .map_err(IndexError::from)?;
    Ok(EmbeddedIndexCheckpoint {
      sequence: checkpoint.sequence as i64,
      data: checkpoint.bytes.into(),
    })
  }

  pub(crate) async fn optimize(&self, table: String) -> napi::Result<()> {
    self.manager.table(&table)?.index.write().await.optimize();
    Ok(())
  }

  pub(crate) async fn mark_checkpoint_persisted(&self, table: String, sequence: i64) -> napi::Result<()> {
    self
      .manager
      .table(&table)?
      .index
      .write()
      .await
      .mark_checkpoint_persisted(sequence as u64)
      .map_err(IndexError::from)?;
    Ok(())
  }
}

fn highlight_tags(dsl: &JsonValue) -> HighlightTags {
  dsl
    .pointer("/highlight/fields")
    .and_then(JsonValue::as_object)
    .into_iter()
    .flatten()
    .filter_map(|(field, options)| {
      Some((
        field.clone(),
        (
          options.get("pre_tags")?.as_array()?.first()?.as_str()?.to_string(),
          options.get("post_tags")?.as_array()?.first()?.as_str()?.to_string(),
        ),
      ))
    })
    .collect()
}

impl Default for EmbeddedSearchIndex {
  fn default() -> Self {
    Self::new()
  }
}

#[cfg(test)]
mod tests {
  use serde_json::{Value, json};

  use super::EmbeddedSearchIndex;

  fn doc(workspace: &str, id: &str, title: &str, updated_at: i64) -> Value {
    json!({
      "workspace_id": workspace,
      "doc_id": id,
      "title": title,
      "summary": title,
      "created_by_user_id": "user",
      "updated_by_user_id": "user",
      "created_at": updated_at,
      "updated_at": updated_at
    })
  }

  fn search(query: Value, cursor: Option<&str>) -> String {
    json!({
      "query": query,
      "fields": ["doc_id", "title"],
      "_source": ["doc_id"],
      "sort": ["_score", { "updated_at": "desc" }, "doc_id"],
      "size": 1,
      "cursor": cursor
    })
    .to_string()
  }

  #[tokio::test]
  async fn exact_search_cursor_and_checkpoint_roundtrip() {
    let index = EmbeddedSearchIndex::new();
    index
      .write(
        "doc".into(),
        json!([
          doc("workspace-1", "one", "设计文档", 1),
          doc("workspace-1", "two", "设计方案", 2),
          doc("workspace-2", "three", "设计文档", 3)
        ])
        .to_string(),
      )
      .await
      .unwrap();

    let query = json!({ "term": { "workspace_id": { "value": "workspace-1" } } });
    let first: Value =
      serde_json::from_str(&index.search("doc".into(), search(query.clone(), None)).await.unwrap()).unwrap();
    assert_eq!(first["total"], 2);
    assert_eq!(first["nodes"][0]["id"], "workspace-1/two");
    assert_eq!(first["nodes"][0]["fields"]["doc_id"], json!(["two"]));
    let cursor = first["nextCursor"].as_str().unwrap();

    let second: Value = serde_json::from_str(
      &index
        .search("doc".into(), search(query.clone(), Some(cursor)))
        .await
        .unwrap(),
    )
    .unwrap();
    assert_eq!(second["nodes"][0]["id"], "workspace-1/one");

    let checkpoint = index.checkpoint("doc".into()).await.unwrap();
    index.reset("doc".into()).await.unwrap();
    let empty: Value =
      serde_json::from_str(&index.search("doc".into(), search(query.clone(), None)).await.unwrap()).unwrap();
    assert_eq!(empty["total"], 0);
    index.restore("doc".into(), checkpoint.data).await.unwrap();
    let restored: Value =
      serde_json::from_str(&index.search("doc".into(), search(query, None)).await.unwrap()).unwrap();
    assert_eq!(restored["total"], 2);

    let aggregate: Value = serde_json::from_str(
      &index
        .aggregate(
          "doc".into(),
          json!({
            "query":{"match_all":{}},
            "from":0,
            "aggs":{"result":{"terms":{"field":"workspace_id","size":10},"aggs":{"result":{"top_hits":{
              "size":1,"fields":["doc_id","title"],"sort":["updated_at","doc_id"]
            }}}}}
          })
          .to_string(),
        )
        .await
        .unwrap(),
    )
    .unwrap();
    assert_eq!(aggregate["total"], 2);
    assert_eq!(aggregate["buckets"][0]["key"], "workspace-1");
    assert_eq!(aggregate["buckets"][0]["count"], 2);
    assert!(aggregate["buckets"][0]["hits"][0]["fields"]["doc_id"].is_array());
  }

  #[tokio::test]
  async fn write_is_atomic_and_corrupt_checkpoint_is_rejected() {
    let index = EmbeddedSearchIndex::new();
    let documents = json!([
      doc("workspace", "valid", "hello", 1),
      { "workspace_id": "workspace", "doc_id": "invalid", "unknown": true }
    ]);
    assert!(index.write("doc".into(), documents.to_string()).await.is_err());

    let all = json!({ "match_all": {} });
    let result: Value = serde_json::from_str(&index.search("doc".into(), search(all, None)).await.unwrap()).unwrap();
    assert_eq!(result["total"], 0);
    assert!(index.restore("doc".into(), vec![1, 2, 3].into()).await.is_err());
  }
}
