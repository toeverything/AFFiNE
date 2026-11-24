use memory_indexer::{FieldType, Query, SearchMode, SearchOptions, Sort, SortOrder, SortValue, Value};
use serde_json::Value as JsonValue;

use super::schema::TableSchema;
use crate::error::{SearchError, SearchResult};

pub(super) fn compile_query(table: &TableSchema, value: &JsonValue) -> SearchResult<Query> {
  let query = if let Some(node) = value.get("match") {
    let (field, options) = first_entry(node, "match")?;
    Query::text(
      table.field(field)?,
      required_string(options, "query")?,
      SearchMode::Auto,
    )
  } else if let Some(node) = value.get("term") {
    let (field, options) = first_entry(node, "term")?;
    let field_id = table.field(field)?;
    Query::term(field_id, parse_term(table.field_type(field_id), options.get("value"))?)
  } else if let Some(node) = value.get("exists") {
    Query::Exists(table.field(required_string(node, "field")?)?)
  } else if value.get("match_all").is_some() {
    Query::All
  } else if let Some(node) = value.get("bool") {
    Query::boolean(
      compile_clauses(table, node.get("must"))?,
      compile_clauses(table, node.get("should"))?,
      compile_clauses(table, node.get("must_not"))?,
    )
  } else {
    return Err(SearchError::invalid_input("unsupported search query"));
  };
  let boost = query_boost(value);
  Ok(if boost == 1.0 {
    query
  } else {
    Query::Boost {
      query: Box::new(query),
      factor: boost,
    }
  })
}

pub(super) fn compile_options(table: &TableSchema, dsl: &JsonValue) -> SearchResult<SearchOptions> {
  let limit = dsl.get("size").and_then(JsonValue::as_u64).unwrap_or(10) as usize;
  let offset = dsl.get("from").and_then(JsonValue::as_u64).unwrap_or(0) as usize;
  let mut stored_fields = string_array(dsl.get("fields"))
    .into_iter()
    .chain(string_array(dsl.get("_source")))
    .map(|field| table.field(field))
    .collect::<SearchResult<Vec<_>>>()?;
  let mut seen = std::collections::HashSet::new();
  stored_fields.retain(|field| seen.insert(*field));
  let highlight_fields = dsl
    .pointer("/highlight/fields")
    .and_then(JsonValue::as_object)
    .map(|fields| {
      fields
        .keys()
        .map(|field| table.field(field))
        .collect::<SearchResult<Vec<_>>>()
    })
    .transpose()?
    .unwrap_or_default();
  let sort = compile_sort(table, dsl.get("sort"))?;
  let after = dsl
    .get("cursor")
    .and_then(JsonValue::as_str)
    .map(|cursor| parse_cursor(cursor, &sort, table))
    .transpose()?;
  Ok(SearchOptions {
    limit,
    offset,
    after,
    sort,
    stored_fields,
    highlight_fields,
  })
}

fn compile_sort(table: &TableSchema, value: Option<&JsonValue>) -> SearchResult<Vec<Sort>> {
  let mut sorts = Vec::new();
  for item in value.and_then(JsonValue::as_array).into_iter().flatten() {
    if let Some(field) = item.as_str() {
      match field {
        "_score" => sorts.push(Sort::ScoreDesc),
        "id" | "_id" => sorts.push(Sort::DocumentId),
        field => sorts.push(Sort::Field {
          field: table.field(field)?,
          order: SortOrder::Asc,
        }),
      }
    } else if let Some((field, order)) = item.as_object().and_then(|value| value.iter().next()) {
      sorts.push(Sort::Field {
        field: table.field(field)?,
        order: if order.as_str() == Some("desc") {
          SortOrder::Desc
        } else {
          SortOrder::Asc
        },
      });
    }
  }
  Ok(sorts)
}

fn parse_cursor(cursor: &str, sorts: &[Sort], table: &TableSchema) -> SearchResult<Vec<SortValue>> {
  let values: Vec<JsonValue> =
    serde_json::from_str(cursor).map_err(|error| SearchError::json("decode search cursor", error))?;
  let mut effective = sorts.to_vec();
  if !effective.iter().any(|sort| matches!(sort, Sort::DocumentId)) {
    effective.push(Sort::DocumentId);
  }
  if values.len() != effective.len() {
    return Err(SearchError::invalid_input("invalid search cursor"));
  }
  values
    .into_iter()
    .zip(effective)
    .map(|(value, sort)| match sort {
      _ if value.is_null() => Ok(SortValue::Missing),
      Sort::ScoreDesc => value
        .as_f64()
        .map(|value| SortValue::Score(value as f32))
        .ok_or_else(|| SearchError::invalid_input("invalid score cursor")),
      Sort::DocumentId => value
        .as_str()
        .map(|value| SortValue::String(value.into()))
        .ok_or_else(|| SearchError::invalid_input("invalid document cursor")),
      Sort::Field { field, .. } => match table.field_type(field) {
        FieldType::Keyword => value
          .as_str()
          .map(|value| SortValue::String(value.into()))
          .ok_or_else(|| SearchError::invalid_input("invalid keyword cursor")),
        FieldType::I64 => value
          .as_i64()
          .map(SortValue::I64)
          .ok_or_else(|| SearchError::invalid_input("invalid integer cursor")),
        FieldType::Bool => value
          .as_bool()
          .map(SortValue::Bool)
          .ok_or_else(|| SearchError::invalid_input("invalid boolean cursor")),
        FieldType::Text(_) => Err(SearchError::invalid_input("text fields are not sortable")),
      },
    })
    .collect()
}

fn compile_clauses(table: &TableSchema, value: Option<&JsonValue>) -> SearchResult<Vec<Query>> {
  value
    .and_then(JsonValue::as_array)
    .into_iter()
    .flatten()
    .map(|query| compile_query(table, query))
    .collect()
}

fn query_boost(value: &JsonValue) -> f32 {
  for operator in ["match", "term", "exists", "match_all", "bool"] {
    let Some(node) = value.get(operator) else {
      continue;
    };
    if let Some(boost) = node.get("boost").and_then(JsonValue::as_f64) {
      return boost as f32;
    }
    if let Some((_, options)) = node.as_object().and_then(|value| value.iter().next())
      && let Some(boost) = options.get("boost").and_then(JsonValue::as_f64)
    {
      return boost as f32;
    }
  }
  1.0
}

fn first_entry<'a>(value: &'a JsonValue, operator: &str) -> SearchResult<(&'a str, &'a JsonValue)> {
  value
    .as_object()
    .and_then(|value| value.iter().next())
    .map(|(field, value)| (field.as_str(), value))
    .ok_or_else(|| SearchError::invalid_input(format!("invalid {operator} query")))
}

fn required_string<'a>(value: &'a JsonValue, field: &str) -> SearchResult<&'a str> {
  value
    .get(field)
    .and_then(JsonValue::as_str)
    .ok_or_else(|| SearchError::invalid_input(format!("{field} must be a string")))
}

fn parse_term(field_type: &FieldType, value: Option<&JsonValue>) -> SearchResult<Value> {
  let value = value.ok_or_else(|| SearchError::invalid_input("term value is required"))?;
  match field_type {
    FieldType::Keyword => value
      .as_str()
      .map(|value| Value::String(value.into()))
      .ok_or_else(|| SearchError::invalid_input("keyword term must be a string")),
    FieldType::I64 => value
      .as_i64()
      .map(Value::I64)
      .ok_or_else(|| SearchError::invalid_input("integer term must be an integer")),
    FieldType::Bool => value
      .as_bool()
      .map(Value::Bool)
      .ok_or_else(|| SearchError::invalid_input("boolean term must be a boolean")),
    FieldType::Text(_) => Err(SearchError::invalid_input("term query does not accept text fields")),
  }
}

fn string_array(value: Option<&JsonValue>) -> Vec<&str> {
  value
    .and_then(JsonValue::as_array)
    .into_iter()
    .flatten()
    .filter_map(JsonValue::as_str)
    .collect()
}
