use serde_json::{Map, Value, json};

use crate::runtime::{RuntimeError, RuntimeResult};

pub(super) fn translate_search_request(physical_table: &str, dsl: Value) -> RuntimeResult<Value> {
  let object = dsl
    .as_object()
    .ok_or_else(|| RuntimeError::invalid_input("invalid search request"))?;
  let size = object.get("size").and_then(Value::as_u64).unwrap_or(10);
  let offset = if let Some(cursor) = object.get("cursor") {
    let cursor = cursor
      .as_str()
      .ok_or_else(|| RuntimeError::invalid_input("invalid search cursor"))?;
    serde_json::from_str::<Value>(cursor)
      .ok()
      .and_then(|cursor| cursor.get("offset").and_then(Value::as_u64))
      .ok_or_else(|| RuntimeError::invalid_input("invalid search cursor"))?
  } else {
    object.get("from").and_then(Value::as_u64).unwrap_or_default()
  };
  let query = object.get("query").cloned().unwrap_or_else(|| json!({"match_all":{}}));
  let query = translate_query(query)?;
  let mut request = json!({
    "table":physical_table,
    "query":query,
    "limit":size,
    "offset":offset,
  });
  if let Some(sort) = object.get("sort") {
    request["sort"] = translate_sort(sort)?;
  }
  let mut source = Vec::new();
  if let Some(fields) = object.get("_source").and_then(Value::as_array) {
    source.extend(fields.iter().filter_map(Value::as_str).map(str::to_string));
  }
  if let Some(fields) = object.get("fields").and_then(Value::as_array) {
    source.extend(fields.iter().filter_map(Value::as_str).map(str::to_string));
  }
  source.push("external_id".to_string());
  source.push("doc_id".to_string());
  source.push("source_version".to_string());
  source.push("permission_version".to_string());
  source.sort();
  source.dedup();
  request["_source"] = json!(source);
  if let Some(highlight) = object.get("highlight") {
    request["highlight"] = translate_highlight(highlight)?;
  }
  Ok(request)
}

fn translate_highlight(highlight: &Value) -> RuntimeResult<Value> {
  let fields = highlight
    .get("fields")
    .and_then(Value::as_object)
    .ok_or(RuntimeError::SearchUnsupportedQuery)?;
  let mut request = json!({"fields":fields.keys().collect::<Vec<_>>()});
  let tags = fields.values().filter_map(Value::as_object).next();
  if let Some(pre_tag) = tags
    .and_then(|options| options.get("pre_tags"))
    .and_then(Value::as_array)
    .and_then(|tags| tags.first())
    .and_then(Value::as_str)
  {
    request["pre_tags"] = json!(pre_tag);
  }
  if let Some(post_tag) = tags
    .and_then(|options| options.get("post_tags"))
    .and_then(Value::as_array)
    .and_then(|tags| tags.first())
    .and_then(Value::as_str)
  {
    request["post_tags"] = json!(post_tag);
  }
  Ok(request)
}

pub(super) fn translate_sort(sort: &Value) -> RuntimeResult<Value> {
  let values = sort
    .as_array()
    .ok_or_else(|| RuntimeError::invalid_input("invalid search sort"))?
    .iter()
    .filter_map(|value| match value {
      Value::String(field) => match field.as_str() {
        "_score" => None,
        "_id" => Some(json!({"id":"asc"})),
        field => Some(json!({field:"asc"})),
      },
      Value::Object(object) => {
        let (field, direction) = object.iter().next()?;
        let field = match field.as_str() {
          "_id" => "id",
          "_score" => return None,
          field => field,
        };
        Some(json!({field:direction}))
      }
      _ => None,
    })
    .collect::<Vec<_>>();
  Ok(json!(values))
}

pub(super) fn translate_query(query: Value) -> RuntimeResult<Value> {
  let Some(object) = query.as_object() else {
    return Err(RuntimeError::SearchUnsupportedQuery);
  };
  if object.contains_key("match_all") {
    return Ok(json!({"match_all":{}}));
  }
  if let Some(match_query) = object.get("match") {
    let Some((field, value)) = match_query.as_object().and_then(|object| object.iter().next()) else {
      return Err(RuntimeError::SearchUnsupportedQuery);
    };
    let value = value
      .get("query")
      .cloned()
      .or_else(|| value.as_str().map(|value| json!(value)))
      .ok_or(RuntimeError::SearchUnsupportedQuery)?;
    return Ok(json!({"match":{field:value}}));
  }
  if let Some(term_query) = object.get("term") {
    let Some((field, value)) = term_query.as_object().and_then(|object| object.iter().next()) else {
      return Err(RuntimeError::SearchUnsupportedQuery);
    };
    let value = value
      .get("value")
      .cloned()
      .ok_or(RuntimeError::SearchUnsupportedQuery)?;
    if field == "acl_read_tokens" {
      let value = value.as_str().ok_or(RuntimeError::SearchUnsupportedQuery)?;
      return Ok(json!({"match":{field:value}}));
    }
    return Ok(json!({"equals":{field:manticore_scalar(value)?}}));
  }
  if let Some(bool_query) = object.get("bool") {
    let Some(bool_query) = bool_query.as_object() else {
      return Err(RuntimeError::SearchUnsupportedQuery);
    };
    let mut translated = Map::new();
    for occurrence in ["must", "should", "must_not"] {
      let Some(clauses) = bool_query.get(occurrence) else {
        continue;
      };
      let clauses = if let Some(array) = clauses.as_array() {
        array
          .iter()
          .map(|clause| translate_query(clause.clone()))
          .collect::<RuntimeResult<Vec<_>>>()?
      } else {
        vec![translate_query(clauses.clone())?]
      };
      translated.insert(occurrence.to_string(), json!(clauses));
    }
    return Ok(json!({"bool":translated}));
  }
  if object.contains_key("boost") {
    return translate_query(object.get("boost").cloned().unwrap_or_default());
  }
  Err(RuntimeError::SearchUnsupportedQuery)
}

fn manticore_scalar(value: Value) -> RuntimeResult<Value> {
  Ok(match value {
    Value::Bool(value) => json!(i32::from(value)),
    Value::String(value) => json!(value),
    Value::Number(value) => Value::Number(value),
    _ => return Err(RuntimeError::SearchUnsupportedQuery),
  })
}
