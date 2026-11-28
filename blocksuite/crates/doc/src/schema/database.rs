use std::collections::BTreeMap;

use serde_json::Value as JsonValue;
use y_octo::{Any, SessionValue};

use super::text_value;

/// Specification for one column in `prop:columns` of an `affine:database` block.
#[derive(Debug, Clone, PartialEq)]
pub struct DatabaseColumnSpec {
    pub id: String,
    pub column_type: String,
    pub name: String,
    pub data: JsonValue,
}

/// Specification for one cell value in `prop:cells` of an `affine:database` block.
#[derive(Debug, Clone, PartialEq)]
pub enum DatabaseCellSpec {
    RichText(String),
    Text(String),
    MultiSelect(Vec<String>),
    Number(f64),
    Integer(i64),
    Bool(bool),
    Null,
    Json(JsonValue),
}

impl DatabaseCellSpec {
    /// Convert this typed cell value into its BlockSuite `0.27.5` `SessionValue` wire encoding.
    pub fn into_session_value(self) -> SessionValue {
        match self {
            Self::RichText(s) => text_value(&s),
            Self::Text(s) => SessionValue::Any(Any::String(s)),
            Self::MultiSelect(items) => {
                SessionValue::Any(Any::Array(items.into_iter().map(Any::String).collect()))
            }
            Self::Number(n) => SessionValue::Any(Any::Float64(n.into())),
            Self::Integer(n) => SessionValue::Any(Any::BigInt64(n)),
            Self::Bool(b) => SessionValue::Any(if b { Any::True } else { Any::False }),
            Self::Null => SessionValue::Any(Any::Null),
            Self::Json(v) => json_to_session_value(&v),
        }
    }
}

/// Specification for one view entry in `prop:views` of an `affine:database` block.
#[derive(Debug, Clone, PartialEq)]
pub struct DatabaseViewSpec {
    pub id: String,
    pub name: String,
    pub mode: String,
    pub raw: JsonValue,
}

/// Authoring specification for an `affine:database` (`sys:version = 3`) block.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct DatabaseSpec {
    pub title: String,
    pub columns: Vec<DatabaseColumnSpec>,
    pub views: Vec<DatabaseViewSpec>,
    /// `row_id -> (column_id -> cell_value)`.
    pub cells: BTreeMap<String, BTreeMap<String, DatabaseCellSpec>>,
}

impl DatabaseSpec {
    /// Serialize this database specification into `prop:*` `SessionValue` entries.
    pub(super) fn into_prop_entries(self) -> Vec<(String, SessionValue)> {
        let columns: Vec<SessionValue> = self
            .columns
            .into_iter()
            .map(|col| {
                SessionValue::Map(vec![
                    ("id".to_string(), SessionValue::Any(Any::String(col.id))),
                    (
                        "type".to_string(),
                        SessionValue::Any(Any::String(col.column_type)),
                    ),
                    ("name".to_string(), SessionValue::Any(Any::String(col.name))),
                    ("data".to_string(), json_to_session_value(&col.data)),
                ])
            })
            .collect();

        let views: Vec<SessionValue> = self
            .views
            .into_iter()
            .map(|view| {
                let mut entries: Vec<(String, SessionValue)> = Vec::new();
                if let JsonValue::Object(map) = view.raw {
                    for (k, v) in map {
                        if matches!(k.as_str(), "id" | "name" | "mode") {
                            continue;
                        }
                        entries.push((k, json_to_session_value(&v)));
                    }
                }
                entries.insert(
                    0,
                    ("id".to_string(), SessionValue::Any(Any::String(view.id))),
                );
                entries.insert(
                    1,
                    (
                        "name".to_string(),
                        SessionValue::Any(Any::String(view.name)),
                    ),
                );
                entries.insert(
                    2,
                    (
                        "mode".to_string(),
                        SessionValue::Any(Any::String(view.mode)),
                    ),
                );
                SessionValue::Map(entries)
            })
            .collect();

        let cells: Vec<(String, SessionValue)> = self
            .cells
            .into_iter()
            .map(|(row_id, row_cells)| {
                let cols: Vec<(String, SessionValue)> = row_cells
                    .into_iter()
                    .map(|(col_id, cell_spec)| {
                        let value = cell_spec.into_session_value();
                        (
                            col_id.clone(),
                            SessionValue::Map(vec![
                                (
                                    "columnId".to_string(),
                                    SessionValue::Any(Any::String(col_id)),
                                ),
                                ("value".to_string(), value),
                            ]),
                        )
                    })
                    .collect();
                (row_id, SessionValue::Map(cols))
            })
            .collect();

        vec![
            ("prop:title".to_string(), text_value(&self.title)),
            ("prop:views".to_string(), SessionValue::Array(views)),
            ("prop:columns".to_string(), SessionValue::Array(columns)),
            ("prop:cells".to_string(), SessionValue::Map(cells)),
        ]
    }
}

/// Convert an arbitrary [`JsonValue`] into a nested `SessionValue` (`Y.Map` / `Y.Array` /
/// `Any` scalars) matching BlockSuite `0.27.5` `native2Y`.
pub fn json_to_session_value(value: &JsonValue) -> SessionValue {
    match value {
        JsonValue::Null => SessionValue::Any(Any::Null),
        JsonValue::Bool(b) => SessionValue::Any(if *b { Any::True } else { Any::False }),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                if let Ok(i32_val) = i32::try_from(i) {
                    SessionValue::Any(Any::Integer(i32_val))
                } else {
                    SessionValue::Any(Any::BigInt64(i))
                }
            } else {
                SessionValue::Any(Any::Float64(n.as_f64().unwrap_or(0.0).into()))
            }
        }
        JsonValue::String(s) => SessionValue::Any(Any::String(s.clone())),
        JsonValue::Array(items) => {
            SessionValue::Array(items.iter().map(json_to_session_value).collect())
        }
        JsonValue::Object(map) => SessionValue::Map(
            map.iter()
                .map(|(k, v)| (k.clone(), json_to_session_value(v)))
                .collect(),
        ),
    }
}
