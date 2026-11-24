mod document;
mod query;
mod result;
mod schema;

use std::collections::HashMap;
use std::sync::Arc;

use memory_indexer::{MemoryIndex, Mutation, TermsAggregation};
use serde_json::{Value as JsonValue, json};
use tokio::sync::RwLock;
use uuid::Uuid;

use self::{
  document::compile_document,
  query::{compile_options, compile_query},
  result::{HighlightTags, aggregate_result, search_result},
  schema::TableSchema,
};
use crate::error::{SearchError, SearchResult};

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

  fn table(&self, name: &str) -> SearchResult<&TableIndex> {
    match name {
      "doc" => Ok(&self.doc),
      "block" => Ok(&self.block),
      _ => Err(SearchError::invalid_input(format!("unknown index table {name}"))),
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

#[derive(Clone, Default)]
pub struct EmbeddedSearchIndex {
  manager: Arc<IndexManager>,
}

impl Default for IndexManager {
  fn default() -> Self {
    Self::new()
  }
}

impl EmbeddedSearchIndex {
  pub fn new() -> Self {
    Self {
      manager: Arc::new(IndexManager::new()),
    }
  }

  pub async fn prepare_generation(&self, generation_id: Uuid) {
    self.manager.generation(generation_id, true).await;
  }

  pub async fn has_generation(&self, generation_id: Uuid) -> bool {
    self.manager.generation(generation_id, false).await.is_some()
  }

  pub async fn retain_generation(&self, generation_id: Uuid) {
    self
      .manager
      .generations
      .write()
      .await
      .retain(|id, _| *id == generation_id);
  }

  pub async fn remove_generation(&self, generation_id: Uuid) {
    self.manager.generations.write().await.remove(&generation_id);
  }

  pub async fn write_for_generation(
    &self,
    generation_id: Uuid,
    table: &str,
    documents: Vec<JsonValue>,
  ) -> SearchResult<()> {
    let generation = self
      .manager
      .generation(generation_id, true)
      .await
      .expect("created embedded search generation");
    let table = generation.table(table)?;
    let generation_id_str = generation_id.to_string();
    let compiled = documents
      .into_iter()
      .map(|document| {
        if document.get("generation_id").and_then(JsonValue::as_str) != Some(generation_id_str.as_str()) {
          return Err(SearchError::invalid_input(
            "embedded projection generation does not match target index",
          ));
        }
        compile_document(&table.schema, document)
      })
      .collect::<SearchResult<Vec<_>>>()?;
    table
      .index
      .write()
      .await
      .apply_batch(compiled.into_iter().map(Mutation::Upsert).collect())
      .map_err(|error| SearchError::invalid_state(format!("embedded index write failed: {error}")))?;
    Ok(())
  }

  pub async fn gc_document_history_for_generation(
    &self,
    generation_id: Uuid,
    table_name: &str,
    workspace_id: &str,
    doc_id: &str,
    published_tuple: (i64, i64),
    limit: usize,
  ) -> SearchResult<()> {
    let generation = self
      .manager
      .generation(generation_id, false)
      .await
      .ok_or(SearchError::IndexNotReady)?;
    let table = generation.table(table_name)?;
    let source_version_field = table.schema.field("source_version")?;
    let permission_version_field = table.schema.field("permission_version")?;
    let query = compile_query(
      &table.schema,
      &json!({
        "bool": {"must": [
          {"term": {"workspace_id": {"value": workspace_id}}},
          {"term": {"doc_id": {"value": doc_id}}}
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
      .map_err(|error| SearchError::invalid_state(format!("embedded history GC failed: {error}")))?;
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

  pub async fn gc_workspace_for_generation(
    &self,
    generation_id: Uuid,
    table_name: &str,
    workspace_id: &str,
    source_version_high_water: i64,
    limit: usize,
  ) -> SearchResult<bool> {
    let generation = self
      .manager
      .generation(generation_id, false)
      .await
      .ok_or(SearchError::IndexNotReady)?;
    let table = generation.table(table_name)?;
    let source_version_field = table.schema.field("source_version")?;
    let query = compile_query(
      &table.schema,
      &json!({"term": {"workspace_id": {"value": workspace_id}}}),
    )?;
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
      .map_err(|error| SearchError::invalid_state(format!("embedded workspace GC failed: {error}")))?;
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
      if source_version.is_none_or(|version| version <= source_version_high_water) {
        index.delete(&hit.id);
      }
    }
    Ok(may_have_more)
  }

  pub async fn search_for_generation(
    &self,
    generation_id: Uuid,
    table: &str,
    mut dsl: JsonValue,
  ) -> SearchResult<JsonValue> {
    let generation = self
      .manager
      .generation(generation_id, false)
      .await
      .ok_or(SearchError::IndexNotReady)?;
    let table = generation.table(table)?;
    ensure_projection_fields(&mut dsl)?;
    let query = compile_query(
      &table.schema,
      dsl
        .get("query")
        .ok_or_else(|| SearchError::invalid_input("search query is required"))?,
    )?;
    let result = table
      .index
      .read()
      .await
      .search(&query, compile_options(&table.schema, &dsl)?)
      .map_err(|error| SearchError::invalid_state(format!("embedded search failed: {error}")))?;
    serde_json::to_value(search_result(&table.schema, result, &highlight_tags(&dsl)))
      .map_err(|error| SearchError::json("encode embedded search result", error))
  }

  pub async fn aggregate_for_generation(
    &self,
    generation_id: Uuid,
    table: &str,
    mut dsl: JsonValue,
  ) -> SearchResult<JsonValue> {
    let generation = self
      .manager
      .generation(generation_id, false)
      .await
      .ok_or(SearchError::IndexNotReady)?;
    let table = generation.table(table)?;
    if let Some(top_hits) = dsl.pointer_mut("/aggs/result/aggs/result/top_hits") {
      ensure_projection_fields(top_hits)?;
    }
    let query = compile_query(
      &table.schema,
      dsl
        .get("query")
        .ok_or_else(|| SearchError::invalid_input("aggregate query is required"))?,
    )?;
    let terms = dsl
      .pointer("/aggs/result/terms")
      .ok_or_else(|| SearchError::invalid_input("terms aggregation is required"))?;
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
              .ok_or_else(|| SearchError::invalid_input("aggregation field is required"))?,
          )?,
          limit: limit.saturating_add(1),
          offset: dsl.get("from").and_then(JsonValue::as_u64).unwrap_or(0) as usize,
          top_hits,
        },
      )
      .map_err(|error| SearchError::invalid_state(format!("embedded aggregate failed: {error}")))?;
    serde_json::to_value(aggregate_result(
      &table.schema,
      result,
      limit,
      &highlight_tags(dsl.pointer("/aggs/result/aggs/result/top_hits").unwrap_or(&dsl)),
    ))
    .map_err(|error| SearchError::json("encode embedded aggregate result", error))
  }
}

fn ensure_projection_fields(dsl: &mut JsonValue) -> SearchResult<()> {
  let fields = dsl
    .as_object_mut()
    .ok_or_else(|| SearchError::invalid_input("search DSL must be an object"))?
    .entry("fields")
    .or_insert_with(|| json!([]));
  let fields = fields
    .as_array_mut()
    .ok_or_else(|| SearchError::invalid_input("search fields must be an array"))?;
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
          options.get("pre_tags")?.as_array()?.first()?.as_str()?.to_owned(),
          options.get("post_tags")?.as_array()?.first()?.as_str()?.to_owned(),
        ),
      ))
    })
    .collect()
}
