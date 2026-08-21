mod manticore;
mod remote;

pub(super) use remote::RemoteProvider;
use serde_json::{Value, json};

use super::types::SearchTable;

pub(super) fn mapping(table: SearchTable, provider: &str) -> Value {
  let text_field = table.text_field();
  let mut properties = serde_json::Map::from_iter([
    ("workspace_id".into(), json!({"type":"keyword"})),
    ("workspace_token".into(), json!({"type":"keyword"})),
    ("doc_id".into(), json!({"type":"keyword"})),
    ("doc_token".into(), json!({"type":"keyword"})),
    (text_field.into(), json!({"type":"text"})),
    (
      "created_at".into(),
      json!({"type":if provider == "manticoresearch" { "long" } else { "date" }}),
    ),
    (
      "updated_at".into(),
      json!({"type":if provider == "manticoresearch" { "long" } else { "date" }}),
    ),
    ("created_by_user_id".into(), json!({"type":"keyword"})),
    ("updated_by_user_id".into(), json!({"type":"keyword"})),
    ("acl_public_readable".into(), json!({"type":"boolean"})),
    ("acl_member_default_readable".into(), json!({"type":"boolean"})),
    (
      "acl_read_tokens".into(),
      if provider == "manticoresearch" {
        json!({"type":"keyword","mva":true})
      } else {
        json!({"type":"keyword"})
      },
    ),
    ("acl_revision".into(), json!({"type":"long"})),
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

pub(super) fn manticore_schema(table: SearchTable, physical_table: &str) -> String {
  let common = r#"
    workspace_id string attribute indexed,
    workspace_token string attribute indexed,
    doc_id string attribute indexed,
    doc_token string attribute indexed,"#;
  let fields = match table {
    SearchTable::Doc => format!(
      r#"{common}
      title text,
      summary string stored,
      journal string stored,
      created_by_user_id string attribute indexed,
      updated_by_user_id string attribute indexed,
      created_at timestamp,
      updated_at timestamp,
      acl_public_readable bool,
      acl_member_default_readable bool,
      acl_read_token_ids multi64,
      acl_revision bigint"#,
    ),
    SearchTable::Block => format!(
      r#"{common}
      block_id string attribute indexed,
      block_token string attribute indexed,
      unit_id string attribute indexed,
      projection_version bigint,
      source_hash string attribute indexed,
      visibility string attribute indexed,
      element_id string attribute indexed,
      frame_id string attribute indexed,
      source_block_id string attribute indexed,
      content text,
      flavour string attribute indexed,
      blob string attribute indexed,
      ref_doc_id string attribute indexed,
      ref_doc_token_ids multi64,
      ref string stored,
      parent_flavour string attribute indexed,
      parent_block_id string attribute indexed,
      additional string stored,
      markdown_preview string stored,
      created_by_user_id string attribute indexed,
      updated_by_user_id string attribute indexed,
      created_at timestamp,
      updated_at timestamp,
      acl_public_readable bool,
      acl_member_default_readable bool,
      acl_read_token_ids multi64,
      acl_revision bigint"#,
    ),
  };
  format!(
    "CREATE TABLE IF NOT EXISTS {physical_table} ({fields}) charset_table='non_cjk, chinese' ngram_len='1' \
     ngram_chars='U+1100..U+11FF, U+3130..U+318F, U+A960..U+A97F, U+AC00..U+D7AF, U+D7B0..U+D7FF, U+3040..U+30FF, \
     U+0E00..U+0E7F' index_field_lengths='1'"
  )
}
