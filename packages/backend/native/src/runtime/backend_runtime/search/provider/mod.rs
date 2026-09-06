mod manticore;
mod remote;

use serde_json::{Value, json};

use self::{manticore::ManticoreSearchProvider, remote::RemoteProvider};
use super::{SearchTable, webpki_tls_config};
use crate::runtime::{RuntimeError, RuntimeResult, SearchRuntimeConfig};

fn provider_write_error(status: u16) -> RuntimeError {
  match status {
    408 | 429 | 500..=599 => RuntimeError::SearchProviderUnavailable,
    400..=499 => RuntimeError::SearchSourceInvalid("search provider rejected projection".to_string()),
    _ => RuntimeError::invalid_state("provider_apply_failed"),
  }
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct SearchChange {
  pub(super) table: SearchTable,
  pub(super) external_id: String,
  pub(super) workspace_id: String,
  pub(super) doc_id: String,
  pub(super) source_version: i64,
  pub(super) permission_version: i64,
  pub(super) payload: Value,
}

impl SearchChange {
  fn upsert_payload(&self) -> RuntimeResult<&Value> {
    let payload = &self.payload;
    if payload.get("workspace_id").and_then(Value::as_str) != Some(&self.workspace_id)
      || payload.get("doc_id").and_then(Value::as_str) != Some(&self.doc_id)
      || payload.get("source_version").and_then(Value::as_i64) != Some(self.source_version)
      || payload.get("permission_version").and_then(Value::as_i64) != Some(self.permission_version)
    {
      return Err(RuntimeError::invalid_input(
        "provider projection tuple does not match payload",
      ));
    }
    let generation_id = payload
      .get("generation_id")
      .and_then(Value::as_str)
      .ok_or_else(|| RuntimeError::invalid_input("provider projection generation is required"))?;
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
      return Err(RuntimeError::invalid_input(
        "provider external id does not match projection tuple",
      ));
    }
    Ok(payload)
  }
}

pub(super) enum SearchProvider {
  /// Elasticsearch-compatible provider with the RFC6 shared projection
  /// contract.
  Elasticsearch(RemoteProvider),
  /// Manticore Search provides candidate retrieval. Canonical permission facts
  /// filter every ACL-scoped result before it leaves the runtime.
  ManticoreSearch(ManticoreSearchProvider),
}

impl SearchProvider {
  pub(super) fn new(config: &SearchRuntimeConfig) -> RuntimeResult<Self> {
    match config.provider.as_str() {
      "elasticsearch" => RemoteProvider::new(config).map(Self::Elasticsearch),
      "manticoresearch" => ManticoreSearchProvider::new(config).map(Self::ManticoreSearch),
      _ => Err(crate::runtime::RuntimeError::config("unsupported search provider")),
    }
  }

  pub(super) async fn search(&self, physical_table: &str, dsl: Value) -> RuntimeResult<Value> {
    match self {
      Self::Elasticsearch(provider) => provider.search(physical_table, dsl).await,
      Self::ManticoreSearch(provider) => provider.search(physical_table, dsl).await,
    }
  }

  pub(super) async fn aggregate(&self, physical_table: &str, dsl: Value) -> RuntimeResult<Value> {
    match self {
      Self::Elasticsearch(provider) => provider.aggregate(physical_table, dsl).await,
      Self::ManticoreSearch(provider) => provider.aggregate(physical_table, dsl).await,
    }
  }

  pub(super) async fn provision(&self, physical_table: &str, table: SearchTable) -> RuntimeResult<()> {
    match self {
      Self::Elasticsearch(provider) => provider.provision(physical_table, table).await,
      Self::ManticoreSearch(provider) => provider.provision(physical_table, table).await,
    }
  }

  pub(super) async fn drop_generation_asset(&self, physical_table: &str) -> RuntimeResult<()> {
    match self {
      Self::Elasticsearch(provider) => provider.drop_generation_asset(physical_table).await,
      Self::ManticoreSearch(provider) => provider.drop_generation_asset(physical_table).await,
    }
  }

  pub(super) async fn apply(&self, physical_table: &str, changes: &[SearchChange]) -> RuntimeResult<()> {
    match self {
      Self::Elasticsearch(provider) => provider.apply(physical_table, changes).await,
      Self::ManticoreSearch(provider) => provider.apply(physical_table, changes).await,
    }
  }

  pub(super) async fn gc_document_history(
    &self,
    physical_table: &str,
    workspace_id: &str,
    doc_id: &str,
    source_version: i64,
    permission_version: i64,
    limit: usize,
  ) -> RuntimeResult<()> {
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

  pub(super) async fn gc_workspace(
    &self,
    physical_table: &str,
    workspace_id: &str,
    source_version_high_water: i64,
    limit: usize,
  ) -> RuntimeResult<bool> {
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

fn mapping(table: SearchTable) -> Value {
  let text_field = table.text_field();
  let mut properties = serde_json::Map::from_iter([
    ("workspace_id".into(), json!({"type":"keyword"})),
    ("workspace_token".into(), json!({"type":"keyword"})),
    ("generation_id".into(), json!({"type":"keyword"})),
    ("source_version".into(), json!({"type":"long"})),
    ("permission_version".into(), json!({"type":"long"})),
    ("doc_id".into(), json!({"type":"keyword"})),
    ("doc_token".into(), json!({"type":"keyword"})),
    (text_field.into(), json!({"type":"text"})),
    ("created_at".into(), json!({"type":"date"})),
    ("updated_at".into(), json!({"type":"date"})),
    ("created_by_user_id".into(), json!({"type":"keyword"})),
    ("updated_by_user_id".into(), json!({"type":"keyword"})),
    ("acl_public_readable".into(), json!({"type":"boolean"})),
    ("acl_member_default_readable".into(), json!({"type":"boolean"})),
    ("acl_read_tokens".into(), json!({"type":"keyword"})),
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
      properties.insert(field.into(), json!({"type":"keyword"}));
    }
    properties.insert("projection_version".into(), json!({"type":"integer"}));
    for field in ["ref", "additional", "markdown_preview"] {
      properties.insert(field.into(), json!({"type":"text","index":false}));
    }
  } else {
    properties.insert("summary".into(), json!({"type":"text","index":false}));
    properties.insert("journal".into(), json!({"type":"keyword"}));
  }
  json!({"mappings":{"properties":properties}})
}

pub(super) fn projection_external_id(
  table: SearchTable,
  generation_id: &str,
  workspace_id: &str,
  doc_id: &str,
  block_id: Option<&str>,
  source_version: i64,
  permission_version: i64,
) -> RuntimeResult<String> {
  let mut id = format!("{generation_id}/{workspace_id}/{doc_id}/{source_version}/{permission_version}");
  if table == SearchTable::Block {
    let block_id = block_id
      .filter(|block_id| !block_id.is_empty())
      .ok_or_else(|| RuntimeError::invalid_input("block projection id requires block_id"))?;
    id.push('/');
    id.push_str(block_id);
  }
  Ok(id)
}

#[cfg(test)]
mod tests {
  use serde_json::json;

  use super::{SearchChange, SearchTable, projection_external_id};

  #[test]
  fn projection_ids_are_stable_and_keep_block_identity_last() {
    let doc = projection_external_id(SearchTable::Doc, "generation", "workspace", "doc", None, 7, 3).unwrap();
    assert_eq!(doc, "generation/workspace/doc/7/3");
    assert_eq!(
      projection_external_id(SearchTable::Doc, "generation", "workspace", "doc", None, 7, 3).unwrap(),
      doc
    );
    assert_eq!(
      projection_external_id(
        SearchTable::Block,
        "generation",
        "workspace",
        "doc",
        Some("block"),
        7,
        3,
      )
      .unwrap(),
      "generation/workspace/doc/7/3/block"
    );
    assert_ne!(
      projection_external_id(SearchTable::Doc, "generation", "workspace", "doc", None, 8, 3).unwrap(),
      doc
    );
  }

  #[test]
  fn change_rejects_an_external_id_outside_its_tuple() {
    let change = SearchChange {
      table: SearchTable::Doc,
      external_id: "generation/workspace/doc/6/3".into(),
      workspace_id: "workspace".into(),
      doc_id: "doc".into(),
      source_version: 7,
      permission_version: 3,
      payload: json!({
        "generation_id":"generation",
        "workspace_id":"workspace",
        "doc_id":"doc",
        "source_version":7,
        "permission_version":3
      }),
    };
    assert!(change.upsert_payload().is_err());
  }
}
