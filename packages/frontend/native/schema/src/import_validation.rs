use std::collections::BTreeSet;

use sqlx::{Pool, Row, sqlite::Sqlite};

pub struct ImportSchemaRules {
  pub tables: &'static [ImportTableRule],
  pub indexes: &'static [ImportIndexRule],
}

pub struct ImportTableRule {
  pub name: &'static str,
  pub columns: &'static [&'static str],
  pub enforce_columns: bool,
  pub required: bool,
}

pub struct ImportIndexRule {
  pub name: &'static str,
  pub table: &'static str,
  pub columns: &'static [&'static str],
  pub required: bool,
}

pub const V2_IMPORT_SCHEMA_RULES: ImportSchemaRules = ImportSchemaRules {
  tables: &[
    ImportTableRule {
      name: "meta",
      columns: &["space_id"],
      enforce_columns: true,
      required: true,
    },
    ImportTableRule {
      name: "snapshots",
      columns: &["doc_id", "data", "created_at", "updated_at"],
      enforce_columns: true,
      required: true,
    },
    ImportTableRule {
      name: "updates",
      columns: &["doc_id", "created_at", "data"],
      enforce_columns: true,
      required: true,
    },
    ImportTableRule {
      name: "clocks",
      columns: &["doc_id", "timestamp"],
      enforce_columns: true,
      required: true,
    },
    ImportTableRule {
      name: "blobs",
      columns: &["key", "data", "mime", "size", "created_at", "deleted_at"],
      enforce_columns: true,
      required: true,
    },
    ImportTableRule {
      name: "peer_clocks",
      columns: &["peer", "doc_id", "remote_clock", "pulled_remote_clock", "pushed_clock"],
      enforce_columns: true,
      required: true,
    },
    ImportTableRule {
      name: "peer_blob_sync",
      columns: &["peer", "blob_id", "uploaded_at"],
      enforce_columns: true,
      required: false,
    },
    ImportTableRule {
      name: "idx_snapshots",
      columns: &["index_name", "data", "created_at"],
      enforce_columns: true,
      required: false,
    },
    ImportTableRule {
      name: "indexer_sync",
      columns: &["doc_id", "indexed_clock", "indexer_version"],
      enforce_columns: true,
      required: false,
    },
    ImportTableRule {
      name: "_sqlx_migrations",
      columns: &[],
      enforce_columns: false,
      required: false,
    },
  ],
  indexes: &[
    ImportIndexRule {
      name: "peer_clocks_doc_id",
      table: "peer_clocks",
      columns: &["doc_id"],
      required: true,
    },
    ImportIndexRule {
      name: "peer_blob_sync_peer",
      table: "peer_blob_sync",
      columns: &["peer"],
      required: false,
    },
  ],
};

pub const V1_IMPORT_SCHEMA_RULES: ImportSchemaRules = ImportSchemaRules {
  tables: &[
    ImportTableRule {
      name: "updates",
      columns: &["id", "timestamp", "data", "doc_id"],
      enforce_columns: true,
      required: true,
    },
    ImportTableRule {
      name: "blobs",
      columns: &["key", "data", "timestamp"],
      enforce_columns: true,
      required: true,
    },
    ImportTableRule {
      name: "version_info",
      columns: &["version", "timestamp"],
      enforce_columns: true,
      required: true,
    },
    ImportTableRule {
      name: "server_clock",
      columns: &["key", "data", "timestamp"],
      enforce_columns: true,
      required: true,
    },
    ImportTableRule {
      name: "sync_metadata",
      columns: &["key", "data", "timestamp"],
      enforce_columns: true,
      required: true,
    },
  ],
  indexes: &[ImportIndexRule {
    name: "idx_doc_id",
    table: "updates",
    columns: &["doc_id"],
    required: false,
  }],
};

pub async fn validate_import_schema(pool: &Pool<Sqlite>, rules: &ImportSchemaRules) -> sqlx::Result<bool> {
  validate_schema(pool, rules, ValidationMode::Strict).await
}

pub async fn validate_required_schema(pool: &Pool<Sqlite>, rules: &ImportSchemaRules) -> sqlx::Result<bool> {
  validate_schema(pool, rules, ValidationMode::RequiredOnly).await
}

#[derive(Clone, Copy)]
enum ValidationMode {
  Strict,
  RequiredOnly,
}

async fn validate_schema(pool: &Pool<Sqlite>, rules: &ImportSchemaRules, mode: ValidationMode) -> sqlx::Result<bool> {
  let query = match mode {
    ValidationMode::Strict => {
      "SELECT type, name, tbl_name FROM sqlite_schema WHERE type IN ('table', 'index', 'view', 'trigger')"
    }
    ValidationMode::RequiredOnly => "SELECT type, name, tbl_name FROM sqlite_schema WHERE type IN ('table', 'index')",
  };
  let rows = sqlx::query(query).fetch_all(pool).await?;

  let mut seen_tables = BTreeSet::new();
  let mut seen_indexes = BTreeSet::new();

  for row in rows {
    let object_type: String = row.try_get("type")?;
    let name: String = row.try_get("name")?;
    let table_name: String = row.try_get("tbl_name")?;

    if name.starts_with("sqlite_") {
      continue;
    }

    match object_type.as_str() {
      "table" => {
        let Some(rule) = rules.tables.iter().find(|rule| rule.name == name) else {
          if matches!(mode, ValidationMode::Strict) {
            return Ok(false);
          }
          continue;
        };
        if rule.enforce_columns && !table_columns_match(pool, rule).await? {
          return Ok(false);
        }
        seen_tables.insert(name);
      }
      "index" => {
        let Some(rule) = rules
          .indexes
          .iter()
          .find(|rule| rule.name == name && rule.table == table_name)
        else {
          if matches!(mode, ValidationMode::Strict) {
            return Ok(false);
          }
          continue;
        };
        if !index_columns_match(pool, rule).await? {
          return Ok(false);
        }
        seen_indexes.insert(name);
      }
      "view" | "trigger" => return Ok(false),
      _ => return Ok(false),
    }
  }

  if rules
    .tables
    .iter()
    .filter(|rule| rule.required)
    .any(|rule| !seen_tables.contains(rule.name))
  {
    return Ok(false);
  }

  if rules
    .indexes
    .iter()
    .filter(|rule| rule.required)
    .any(|rule| !seen_indexes.contains(rule.name))
  {
    return Ok(false);
  }

  Ok(true)
}

async fn table_columns_match(pool: &Pool<Sqlite>, rule: &ImportTableRule) -> sqlx::Result<bool> {
  let pragma = format!("PRAGMA table_info(\"{}\")", rule.name);
  let rows = sqlx::query(&pragma).fetch_all(pool).await?;
  let columns = rows
    .into_iter()
    .map(|row| row.try_get::<String, _>("name"))
    .collect::<std::result::Result<BTreeSet<_>, _>>()?;

  Ok(columns == rule.columns.iter().map(|column| (*column).to_string()).collect())
}

async fn index_columns_match(pool: &Pool<Sqlite>, rule: &ImportIndexRule) -> sqlx::Result<bool> {
  let pragma = format!("PRAGMA index_info(\"{}\")", rule.name);
  let rows = sqlx::query(&pragma).fetch_all(pool).await?;
  let columns = rows
    .into_iter()
    .map(|row| row.try_get::<String, _>("name"))
    .collect::<std::result::Result<Vec<_>, _>>()?;

  Ok(
    columns
      == rule
        .columns
        .iter()
        .map(|column| (*column).to_string())
        .collect::<Vec<_>>(),
  )
}
