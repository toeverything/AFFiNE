mod elasticsearch;
mod manticore;
mod manticore_query;

use serde_json::{Value, json};

use self::{elasticsearch::ElasticsearchProvider, manticore::ManticoreSearchProvider};
use crate::config::SearchConfig;
use crate::error::{SearchError, SearchResult};
use crate::types::SearchTable;

fn provider_write_error(status: u16) -> SearchError {
  match status {
    408 | 429 | 500..=599 => SearchError::ProviderUnavailable,
    400..=499 => SearchError::GenerationInvalid("search provider rejected projection".to_owned()),
    _ => SearchError::invalid_state("provider_apply_failed"),
  }
}

#[derive(Clone, Debug, PartialEq)]
pub struct SearchChange {
  pub table: SearchTable,
  pub external_id: String,
  pub workspace_id: String,
  pub doc_id: String,
  pub source_version: i64,
  pub permission_version: i64,
  pub payload: Value,
}

impl SearchChange {
  pub(super) fn upsert_payload(&self) -> SearchResult<&Value> {
    let payload = &self.payload;
    if payload.get("workspace_id").and_then(Value::as_str) != Some(&self.workspace_id)
      || payload.get("doc_id").and_then(Value::as_str) != Some(&self.doc_id)
      || payload.get("source_version").and_then(Value::as_i64) != Some(self.source_version)
      || payload.get("permission_version").and_then(Value::as_i64) != Some(self.permission_version)
    {
      return Err(SearchError::invalid_input(
        "provider projection tuple does not match payload",
      ));
    }
    let generation_id = payload
      .get("generation_id")
      .and_then(Value::as_str)
      .ok_or_else(|| SearchError::invalid_input("provider projection generation is required"))?;
    if projection_external_id(
      self.table,
      generation_id,
      &self.workspace_id,
      &self.doc_id,
      payload.get("block_id").and_then(Value::as_str),
      self.source_version,
      self.permission_version,
    )? != self.external_id
    {
      return Err(SearchError::invalid_input(
        "provider external id does not match projection tuple",
      ));
    }
    Ok(payload)
  }
}

pub enum SearchProvider {
  Elasticsearch(ElasticsearchProvider),
  ManticoreSearch(ManticoreSearchProvider),
}

impl SearchProvider {
  pub fn new(config: &SearchConfig) -> SearchResult<Self> {
    match config.provider.as_str() {
      "elasticsearch" => ElasticsearchProvider::new(config).map(Self::Elasticsearch),
      "manticoresearch" => ManticoreSearchProvider::new(config).map(Self::ManticoreSearch),
      _ => Err(SearchError::config("unsupported search provider")),
    }
  }

  pub async fn search(&self, physical_table: &str, dsl: Value) -> SearchResult<Value> {
    match self {
      Self::Elasticsearch(provider) => provider.search(physical_table, dsl).await,
      Self::ManticoreSearch(provider) => provider.search(physical_table, dsl).await,
    }
  }

  pub async fn aggregate(&self, physical_table: &str, dsl: Value) -> SearchResult<Value> {
    match self {
      Self::Elasticsearch(provider) => provider.aggregate(physical_table, dsl).await,
      Self::ManticoreSearch(provider) => provider.aggregate(physical_table, dsl).await,
    }
  }

  pub async fn provision(&self, physical_table: &str, table: SearchTable) -> SearchResult<()> {
    match self {
      Self::Elasticsearch(provider) => provider.provision(physical_table, table).await,
      Self::ManticoreSearch(provider) => provider.provision(physical_table, table).await,
    }
  }

  pub async fn drop_generation_asset(&self, physical_table: &str) -> SearchResult<()> {
    match self {
      Self::Elasticsearch(provider) => provider.drop_generation_asset(physical_table).await,
      Self::ManticoreSearch(provider) => provider.drop_generation_asset(physical_table).await,
    }
  }

  pub async fn apply(&self, physical_table: &str, changes: &[SearchChange]) -> SearchResult<()> {
    match self {
      Self::Elasticsearch(provider) => provider.apply(physical_table, changes).await,
      Self::ManticoreSearch(provider) => provider.apply(physical_table, changes).await,
    }
  }

  pub async fn gc_document_history(
    &self,
    physical_table: &str,
    workspace_id: &str,
    doc_id: &str,
    source_version: i64,
    permission_version: i64,
    limit: usize,
  ) -> SearchResult<()> {
    match self {
      Self::Elasticsearch(provider) => {
        provider
          .gc_document_history(
            physical_table,
            workspace_id,
            doc_id,
            source_version,
            permission_version,
            limit,
          )
          .await
      }
      Self::ManticoreSearch(provider) => {
        provider
          .gc_document_history(
            physical_table,
            workspace_id,
            doc_id,
            source_version,
            permission_version,
            limit,
          )
          .await
      }
    }
  }

  pub async fn gc_workspace(
    &self,
    physical_table: &str,
    workspace_id: &str,
    source_version_high_water: i64,
    limit: usize,
  ) -> SearchResult<bool> {
    match self {
      Self::Elasticsearch(provider) => {
        provider
          .gc_workspace(physical_table, workspace_id, source_version_high_water, limit)
          .await
      }
      Self::ManticoreSearch(provider) => {
        provider
          .gc_workspace(physical_table, workspace_id, source_version_high_water, limit)
          .await
      }
    }
  }
}

pub(super) fn mapping(table: SearchTable) -> Value {
  let text_field = table.text_field();
  let mut properties = serde_json::Map::from_iter([
    ("workspace_id".into(), json!({"type": "keyword"})),
    ("workspace_token".into(), json!({"type": "keyword"})),
    ("generation_id".into(), json!({"type": "keyword"})),
    ("source_version".into(), json!({"type": "long"})),
    ("permission_version".into(), json!({"type": "long"})),
    ("doc_id".into(), json!({"type": "keyword"})),
    ("doc_token".into(), json!({"type": "keyword"})),
    (text_field.into(), json!({"type": "text"})),
    ("created_at".into(), json!({"type": "date"})),
    ("updated_at".into(), json!({"type": "date"})),
    ("created_by_user_id".into(), json!({"type": "keyword"})),
    ("updated_by_user_id".into(), json!({"type": "keyword"})),
    ("acl_public_readable".into(), json!({"type": "boolean"})),
    ("acl_member_default_readable".into(), json!({"type": "boolean"})),
    ("acl_read_tokens".into(), json!({"type": "keyword"})),
  ]);
  if table == SearchTable::Block {
    for field in [
      "block_id",
      "block_token",
      "unit_id",
      "source_hash",
      "visibility",
      "element_id",
      "frame_id",
      "source_block_id",
      "flavour",
      "blob",
      "ref_doc_id",
      "parent_flavour",
      "parent_block_id",
    ] {
      properties.insert(field.into(), json!({"type": "keyword"}));
    }
    properties.insert("projection_version".into(), json!({"type": "integer"}));
    for field in ["ref", "additional", "markdown_preview"] {
      properties.insert(field.into(), json!({"type": "text", "index": false}));
    }
  } else {
    properties.insert("summary".into(), json!({"type": "text", "index": false}));
    properties.insert("journal".into(), json!({"type": "keyword"}));
  }
  json!({"mappings": {"properties": properties}})
}

pub fn projection_external_id(
  table: SearchTable,
  generation_id: &str,
  workspace_id: &str,
  doc_id: &str,
  block_id: Option<&str>,
  source_version: i64,
  permission_version: i64,
) -> SearchResult<String> {
  let mut id = format!("{generation_id}/{workspace_id}/{doc_id}/{source_version}/{permission_version}");
  if table == SearchTable::Block {
    let block_id = block_id
      .filter(|block_id| !block_id.is_empty())
      .ok_or_else(|| SearchError::invalid_input("block projection id requires block_id"))?;
    id.push('/');
    id.push_str(block_id);
  }
  Ok(id)
}
