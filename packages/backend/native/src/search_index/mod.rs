mod document;
mod query;
mod result;
mod schema;

use std::{collections::HashMap, sync::Arc};

use memory_indexer::{MemoryIndex, Mutation, TermsAggregation};
use napi::Status;
use serde_json::{Value as JsonValue, json};
use tokio::sync::RwLock;
use uuid::Uuid;

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

struct GenerationIndex {
  doc: TableIndex,
  block: TableIndex,
}

impl GenerationIndex {
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

struct IndexManager {
  generations: RwLock<HashMap<Uuid, Arc<GenerationIndex>>>,
}

impl IndexManager {
  fn new() -> Self {
    Self {
      generations: RwLock::new(HashMap::new()),
    }
  }

  async fn generation(&self, generation_id: Uuid, create: bool) -> Option<Arc<GenerationIndex>> {
    if let Some(generation) = self.generations.read().await.get(&generation_id).cloned() {
      return Some(generation);
    }
    if !create {
      return None;
    }
    let mut generations = self.generations.write().await;
    Some(
      generations
        .entry(generation_id)
        .or_insert_with(|| Arc::new(GenerationIndex::new()))
        .clone(),
    )
  }
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

  pub(crate) async fn prepare_generation(&self, generation_id: Uuid) {
    self.manager.generation(generation_id, true).await;
  }

  pub(crate) async fn has_generation(&self, generation_id: Uuid) -> bool {
    self.manager.generation(generation_id, false).await.is_some()
  }

  pub(crate) async fn retain_generation(&self, generation_id: Uuid) {
    self
      .manager
      .generations
      .write()
      .await
      .retain(|id, _| *id == generation_id);
  }

  pub(crate) async fn remove_generation(&self, generation_id: Uuid) {
    self.manager.generations.write().await.remove(&generation_id);
  }

  #[cfg(test)]
  pub(crate) async fn write(&self, table: String, documents_json: String) -> napi::Result<()> {
    self.write_for_generation(Uuid::nil(), table, documents_json).await
  }

  pub(crate) async fn write_for_generation(
    &self,
    generation_id: Uuid,
    table: String,
    documents_json: String,
  ) -> napi::Result<()> {
    let generation = self
      .manager
      .generation(generation_id, true)
      .await
      .expect("created embedded search generation");
    let table = generation.table(&table)?;
    let documents: Vec<JsonValue> = serde_json::from_str(&documents_json)?;
    let generation_id = generation_id.to_string();
    let documents = documents
      .into_iter()
      .map(|document| {
        if document.get("generation_id").and_then(JsonValue::as_str) != Some(generation_id.as_str()) {
          return Err(IndexError::InvalidInput(
            "embedded projection generation does not match target index".into(),
          ));
        }
        compile_document(&table.schema, document)
      })
      .collect::<Result<Vec<_>>>()?;
    table
      .index
      .write()
      .await
      .apply_batch(documents.into_iter().map(Mutation::Upsert).collect())
      .map_err(IndexError::from)?;
    Ok(())
  }

  pub(crate) async fn gc_document_history_for_generation(
    &self,
    generation_id: Uuid,
    table_name: &str,
    workspace_id: &str,
    doc_id: &str,
    published_tuple: (i64, i64),
    limit: usize,
  ) -> napi::Result<()> {
    let generation = self
      .manager
      .generation(generation_id, false)
      .await
      .ok_or_else(|| napi::Error::from_reason("embedded search generation is not initialized"))?;
    let table = generation.table(table_name)?;
    let source_version_field = table.schema.field("source_version")?;
    let permission_version_field = table.schema.field("permission_version")?;
    let query = compile_query(
      &table.schema,
      &json!({
        "bool":{"must":[
          {"term":{"workspace_id":{"value":workspace_id}}},
          {"term":{"doc_id":{"value":doc_id}}}
        ]}
      }),
    )?;
    let mut index = table.index.write().await;
    let matches = index
      .search(
        &query,
        memory_indexer::SearchOptions {
          limit: limit.max(1),
          offset: 0,
          after: None,
          sort: vec![memory_indexer::Sort::DocumentId],
          stored_fields: vec![source_version_field, permission_version_field],
          highlight_fields: Vec::new(),
        },
      )
      .map_err(IndexError::from)?;
    for hit in matches.hits {
      let mut hit_source_version = None;
      let mut hit_permission_version = None;
      for (field, values) in hit.fields {
        let value = values.first().and_then(|value| match value {
          memory_indexer::Value::I64(value) => Some(*value),
          _ => None,
        });
        if field == source_version_field {
          hit_source_version = value;
        } else if field == permission_version_field {
          hit_permission_version = value;
        }
      }
      if (hit_source_version, hit_permission_version) != (Some(published_tuple.0), Some(published_tuple.1)) {
        index.delete(&hit.id);
      }
    }
    Ok(())
  }

  pub(crate) async fn gc_workspace_for_generation(
    &self,
    generation_id: Uuid,
    table_name: &str,
    workspace_id: &str,
    source_version_high_water: i64,
    limit: usize,
  ) -> napi::Result<bool> {
    let generation = self
      .manager
      .generation(generation_id, false)
      .await
      .ok_or_else(|| napi::Error::from_reason("embedded search generation is not initialized"))?;
    let table = generation.table(table_name)?;
    let source_version_field = table.schema.field("source_version")?;
    let query = compile_query(&table.schema, &json!({"term":{"workspace_id":{"value":workspace_id}}}))?;
    let mut index = table.index.write().await;
    let matches = index
      .search(
        &query,
        memory_indexer::SearchOptions {
          limit: limit.max(1),
          offset: 0,
          after: None,
          sort: vec![
            memory_indexer::Sort::Field {
              field: source_version_field,
              order: memory_indexer::SortOrder::Asc,
            },
            memory_indexer::Sort::DocumentId,
          ],
          stored_fields: vec![source_version_field],
          highlight_fields: Vec::new(),
        },
      )
      .map_err(IndexError::from)?;
    let may_have_more = matches.hits.len() == limit.max(1)
      && matches.hits.iter().any(|hit| {
        hit.fields.iter().any(|(field, values)| {
          *field == source_version_field
            && values.first().is_none_or(
              |value| !matches!(value, memory_indexer::Value::I64(version) if *version > source_version_high_water),
            )
        })
      });
    for hit in matches.hits {
      let source_version = hit
        .fields
        .iter()
        .find(|(field, _)| *field == source_version_field)
        .and_then(|(_, values)| values.first())
        .and_then(|value| match value {
          memory_indexer::Value::I64(value) => Some(*value),
          _ => None,
        });
      if source_version.is_none_or(|source_version| source_version <= source_version_high_water) {
        index.delete(&hit.id);
      }
    }
    Ok(may_have_more)
  }

  #[cfg(test)]
  pub(crate) async fn search(&self, table: String, dsl_json: String) -> napi::Result<String> {
    self.search_for_generation(Uuid::nil(), table, dsl_json).await
  }

  pub(crate) async fn search_for_generation(
    &self,
    generation_id: Uuid,
    table: String,
    dsl_json: String,
  ) -> napi::Result<String> {
    let generation = self
      .manager
      .generation(generation_id, false)
      .await
      .ok_or_else(|| napi::Error::from_reason("embedded search generation is not initialized"))?;
    let table = generation.table(&table)?;
    let mut dsl: JsonValue = serde_json::from_str(&dsl_json)?;
    ensure_projection_fields(&mut dsl)?;
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

  #[cfg(test)]
  pub(crate) async fn aggregate(&self, table: String, dsl_json: String) -> napi::Result<String> {
    self.aggregate_for_generation(Uuid::nil(), table, dsl_json).await
  }

  pub(crate) async fn aggregate_for_generation(
    &self,
    generation_id: Uuid,
    table: String,
    dsl_json: String,
  ) -> napi::Result<String> {
    let generation = self
      .manager
      .generation(generation_id, false)
      .await
      .ok_or_else(|| napi::Error::from_reason("embedded search generation is not initialized"))?;
    let table = generation.table(&table)?;
    let mut dsl: JsonValue = serde_json::from_str(&dsl_json)?;
    if let Some(top_hits) = dsl.pointer_mut("/aggs/result/aggs/result/top_hits") {
      ensure_projection_fields(top_hits)?;
    }
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
}

fn ensure_projection_fields(dsl: &mut JsonValue) -> Result<()> {
  let fields = dsl
    .as_object_mut()
    .ok_or_else(|| IndexError::InvalidInput("search DSL must be an object".into()))?
    .entry("fields")
    .or_insert_with(|| json!([]));
  let fields = fields
    .as_array_mut()
    .ok_or_else(|| IndexError::InvalidInput("search fields must be an array".into()))?;
  for field in ["doc_id", "source_version", "permission_version"] {
    if !fields.iter().any(|value| value.as_str() == Some(field)) {
      fields.push(json!(field));
    }
  }
  Ok(())
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
  use uuid::Uuid;

  use super::EmbeddedSearchIndex;

  fn doc(workspace: &str, id: &str, title: &str, updated_at: i64) -> Value {
    json!({
      "generation_id": Uuid::nil().to_string(),
      "workspace_id": workspace,
      "doc_id": id,
      "source_version": 1,
      "permission_version": 1,
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
  async fn exact_search_cursor_and_aggregate() {
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
    assert_eq!(first["nodes"][0]["id"], format!("{}/workspace-1/two/1/1", Uuid::nil()));
    assert_eq!(first["nodes"][0]["fields"]["doc_id"], json!(["two"]));
    let cursor = first["nextCursor"].as_str().unwrap();

    let second: Value = serde_json::from_str(
      &index
        .search("doc".into(), search(query.clone(), Some(cursor)))
        .await
        .unwrap(),
    )
    .unwrap();
    assert_eq!(second["nodes"][0]["id"], format!("{}/workspace-1/one/1/1", Uuid::nil()));

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
  async fn write_is_atomic() {
    let index = EmbeddedSearchIndex::new();
    index
      .write(
        "doc".into(),
        json!([{
          "generation_id":Uuid::nil().to_string(),"workspace_id":"workspace","doc_id":"null-values",
          "source_version":1,"permission_version":1,"summary":[null]
        }])
        .to_string(),
      )
      .await
      .unwrap();
    let all = json!({ "match_all": {} });
    let result: Value =
      serde_json::from_str(&index.search("doc".into(), search(all.clone(), None)).await.unwrap()).unwrap();
    assert_eq!(result["total"], 1);

    let documents = json!([
      doc("workspace", "valid", "hello", 1),
      { "workspace_id": "workspace", "doc_id": "invalid", "unknown": true }
    ]);
    assert!(index.write("doc".into(), documents.to_string()).await.is_err());

    let result: Value = serde_json::from_str(&index.search("doc".into(), search(all, None)).await.unwrap()).unwrap();
    assert_eq!(result["total"], 1);
  }

  #[tokio::test]
  async fn immutable_tuples_do_not_overwrite_each_other() {
    let index = EmbeddedSearchIndex::new();
    let mut old = doc("workspace", "doc", "old", 1);
    old["source_version"] = json!(1);
    let mut current = doc("workspace", "doc", "current", 1);
    current["source_version"] = json!(2);
    index
      .write("doc".into(), json!([old, current]).to_string())
      .await
      .unwrap();
    let result: Value = serde_json::from_str(
      &index
        .search(
          "doc".into(),
          json!({"query":{"term":{"doc_id":{"value":"doc"}}},"fields":["title","source_version"],"size":10})
            .to_string(),
        )
        .await
        .unwrap(),
    )
    .unwrap();
    assert_eq!(result["total"], 2);
    assert_ne!(result["nodes"][0]["id"], result["nodes"][1]["id"]);

    let retired = Uuid::new_v4();
    index.prepare_generation(retired).await;
    index.retain_generation(Uuid::nil()).await;
    assert!(index.has_generation(Uuid::nil()).await);
    assert!(!index.has_generation(retired).await);
  }

  #[tokio::test]
  async fn history_gc_keeps_the_published_tuple() {
    let index = EmbeddedSearchIndex::new();
    let mut stale = doc("workspace", "doc", "old", 1);
    stale["source_version"] = json!(1);
    let mut current = doc("workspace", "doc", "current", 1);
    current["source_version"] = json!(2);
    index
      .write("doc".into(), json!([stale, current]).to_string())
      .await
      .unwrap();
    index
      .gc_document_history_for_generation(Uuid::nil(), "doc", "workspace", "doc", (2, 1), 10)
      .await
      .unwrap();
    let result: Value = serde_json::from_str(
      &index
        .search(
          "doc".into(),
          json!({"query":{"term":{"doc_id":{"value":"doc"}}},"fields":["title"],"size":10}).to_string(),
        )
        .await
        .unwrap(),
    )
    .unwrap();
    assert_eq!(result["total"], 1);
    assert_eq!(result["nodes"][0]["fields"]["title"], json!(["current"]));

    index
      .write(
        "doc".into(),
        json!([
          doc("deleted-workspace", "one", "one", 1),
          doc("deleted-workspace", "two", "two", 1)
        ])
        .to_string(),
      )
      .await
      .unwrap();
    assert!(
      index
        .gc_workspace_for_generation(Uuid::nil(), "doc", "deleted-workspace", i64::MAX, 1)
        .await
        .unwrap()
    );
    assert!(
      index
        .gc_workspace_for_generation(Uuid::nil(), "doc", "deleted-workspace", i64::MAX, 1)
        .await
        .unwrap()
    );
    assert!(
      !index
        .gc_workspace_for_generation(Uuid::nil(), "doc", "deleted-workspace", i64::MAX, 1)
        .await
        .unwrap()
    );

    let old = doc("recreated-workspace", "old", "old", 1);
    let mut recreated = doc("recreated-workspace", "new", "new", 1);
    recreated["source_version"] = json!(3);
    index
      .write("doc".into(), json!([old, recreated]).to_string())
      .await
      .unwrap();
    assert!(
      !index
        .gc_workspace_for_generation(Uuid::nil(), "doc", "recreated-workspace", 2, 10)
        .await
        .unwrap()
    );
    let result: Value = serde_json::from_str(
      &index
        .search(
          "doc".into(),
          json!({"query":{"term":{"workspace_id":{"value":"recreated-workspace"}}},"fields":["doc_id"],"size":10})
            .to_string(),
        )
        .await
        .unwrap(),
    )
    .unwrap();
    assert_eq!(result["total"], 1);
    assert_eq!(result["nodes"][0]["fields"]["doc_id"], json!(["new"]));
  }
}
