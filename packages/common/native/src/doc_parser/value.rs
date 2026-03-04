use serde_json::{Map as JsonMap, Value as JsonValue};
use y_octo::{AHashMap, Any, Value};

pub(super) fn any_truthy(value: &Any) -> bool {
  match value {
    Any::True => true,
    Any::False | Any::Null | Any::Undefined => false,
    Any::String(value) => !value.is_empty(),
    Any::Integer(value) => *value != 0,
    Any::Float32(value) => value.0 != 0.0,
    Any::Float64(value) => value.0 != 0.0,
    Any::BigInt64(value) => *value != 0,
    Any::Object(_) | Any::Array(_) | Any::Binary(_) => true,
  }
}

pub(super) fn any_as_string(value: &Any) -> Option<&str> {
  match value {
    Any::String(value) => Some(value),
    _ => None,
  }
}

pub(super) fn any_as_u64(value: &Any) -> Option<u64> {
  match value {
    Any::Integer(value) if *value >= 0 => Some(*value as u64),
    Any::Float32(value) if value.0 >= 0.0 => Some(value.0 as u64),
    Any::Float64(value) if value.0 >= 0.0 => Some(value.0 as u64),
    Any::BigInt64(value) if *value >= 0 => Some(*value as u64),
    _ => None,
  }
}

pub(super) fn value_to_string(value: &Value) -> Option<String> {
  if let Some(text) = value.to_text() {
    return Some(text.to_string());
  }

  if let Some(any) = value.to_any() {
    return any_to_string(&any);
  }

  None
}

pub(super) fn value_to_any(value: &Value) -> Option<Any> {
  if let Some(any) = value.to_any() {
    return Some(any);
  }

  if let Some(text) = value.to_text() {
    return Some(Any::String(text.to_string()));
  }

  if let Some(array) = value.to_array() {
    let mut values = Vec::new();
    for item in array.iter() {
      if let Some(any) = value_to_any(&item) {
        values.push(any);
      } else if let Some(text) = value_to_string(&item) {
        values.push(Any::String(text));
      }
    }
    return Some(Any::Array(values));
  }

  if let Some(map) = value.to_map() {
    let mut values = AHashMap::default();
    for key in map.keys() {
      if let Some(entry) = map.get(key) {
        if let Some(any) = value_to_any(&entry) {
          values.insert(key.to_string(), any);
        } else if let Some(text) = value_to_string(&entry) {
          values.insert(key.to_string(), Any::String(text));
        }
      }
    }
    return Some(Any::Object(values));
  }

  None
}

pub(super) fn value_to_f64(value: Value) -> Option<f64> {
  value.to_any().and_then(|any| match any {
    Any::Integer(v) => Some(v as f64),
    Any::BigInt64(v) => Some(v as f64),
    Any::Float32(v) => Some(v.0 as f64),
    Any::Float64(v) => Some(v.0),
    _ => None,
  })
}

pub(super) fn any_to_string(any: &Any) -> Option<String> {
  match any {
    Any::String(value) => Some(value.to_string()),
    Any::Integer(value) => Some(value.to_string()),
    Any::Float32(value) => Some(value.0.to_string()),
    Any::Float64(value) => Some(value.0.to_string()),
    Any::BigInt64(value) => Some(value.to_string()),
    Any::True => Some("true".into()),
    Any::False => Some("false".into()),
    Any::Null | Any::Undefined => None,
    Any::Array(_) | Any::Object(_) | Any::Binary(_) => serde_json::to_string(any).ok(),
  }
}

pub(super) fn params_any_map_to_json(params: &AHashMap<String, Any>) -> JsonValue {
  let mut values = JsonMap::new();
  for (key, value) in params.iter() {
    if let Ok(value) = serde_json::to_value(value) {
      values.insert(key.clone(), value);
    }
  }
  JsonValue::Object(values)
}

pub(super) fn params_value_to_json(params: &Value) -> Option<JsonValue> {
  serde_json::to_value(params).ok()
}

pub(super) fn build_reference_payload(doc_id: &str, params: Option<JsonValue>) -> String {
  let mut payload = JsonMap::new();
  payload.insert("docId".into(), JsonValue::String(doc_id.to_string()));
  if let Some(JsonValue::Object(params)) = params {
    for (key, value) in params.into_iter() {
      payload.insert(key, value);
    }
  }
  JsonValue::Object(payload).to_string()
}
