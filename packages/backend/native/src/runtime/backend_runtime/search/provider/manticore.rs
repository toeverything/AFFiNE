use serde_json::{Value, json};

use crate::runtime::{RuntimeError, RuntimeResult};

pub(super) fn prepare_manticore_payload(
  payload: &mut Value,
  token_ids: &std::collections::HashMap<String, i64>,
) -> RuntimeResult<()> {
  let object = payload.as_object_mut().expect("search payload is an object");
  object.remove("acl_read_user_ids");
  if let Some(Value::Array(tokens)) = object.remove("acl_read_tokens") {
    object.insert(
      "acl_read_token_ids".to_string(),
      Value::Array(
        tokens
          .iter()
          .filter_map(Value::as_str)
          .map(|token| {
            token_ids
              .get(token)
              .copied()
              .map(Value::from)
              .ok_or_else(|| RuntimeError::invalid_state("Manticore exact token mapping is incomplete"))
          })
          .collect::<RuntimeResult<Vec<_>>>()?,
      ),
    );
  }
  if let Some(Value::Array(tokens)) = object.get("ref_doc_id").cloned() {
    object.insert(
      "ref_doc_token_ids".to_string(),
      Value::Array(
        tokens
          .iter()
          .filter_map(Value::as_str)
          .map(|token| {
            token_ids
              .get(token)
              .copied()
              .map(Value::from)
              .ok_or_else(|| RuntimeError::invalid_state("Manticore exact token mapping is incomplete"))
          })
          .collect::<RuntimeResult<Vec<_>>>()?,
      ),
    );
  }
  for field in ["created_at", "updated_at"] {
    if let Some(value) = object.get_mut(field)
      && let Some(milliseconds) = value.as_i64()
    {
      *value = json!(milliseconds / 1_000);
    }
  }
  for (field, value) in object.iter_mut() {
    if let Value::Array(values) = value {
      *value = if matches!(field.as_str(), "acl_read_token_ids" | "ref_doc_token_ids") {
        continue;
      } else if field == "content" {
        Value::String(values.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(" "))
      } else {
        Value::String(
          serde_json::to_string(values).map_err(|error| RuntimeError::json("encode manticore array", error))?,
        )
      };
    } else if value.is_null() {
      *value = Value::String(String::new());
    }
  }
  Ok(())
}

pub(super) fn prepare_manticore_search(
  dsl: &mut Value,
  cursor: Option<Value>,
  size: u64,
  initial_offset: u64,
  requested_fields: &[String],
  token_ids: &std::collections::HashMap<String, i64>,
) -> RuntimeResult<u64> {
  normalize_manticore_terms(dsl, token_ids)?;
  let object = dsl.as_object_mut().expect("search DSL is an object");
  let mut source = object
    .get("_source")
    .and_then(Value::as_array)
    .into_iter()
    .flatten()
    .filter_map(Value::as_str)
    .map(str::to_string)
    .collect::<std::collections::BTreeSet<_>>();
  source.extend(requested_fields.iter().cloned());
  object.insert("_source".to_string(), json!(source));
  object.remove("fields");
  if let Some(highlight) = object.get_mut("highlight")
    && let Some(options) = highlight
      .get("fields")
      .and_then(Value::as_object)
      .and_then(|fields| fields.values().next())
      .cloned()
  {
    *highlight = options;
  }
  let offset = if let Some(Value::String(cursor)) = cursor {
    let offset = serde_json::from_str::<Value>(&cursor)
      .map_err(|error| RuntimeError::json("invalid search cursor", error))?
      .get("offset")
      .and_then(Value::as_u64)
      .ok_or_else(|| RuntimeError::invalid_input("invalid search cursor"))?;
    if offset.saturating_add(size) > 10_000 {
      return Err(RuntimeError::invalid_input("search cursor exceeds 10000"));
    }
    object.insert("from".to_string(), json!(offset));
    offset
  } else if cursor.is_some() {
    return Err(RuntimeError::invalid_input("invalid search cursor"));
  } else {
    initial_offset
  };
  Ok(offset)
}

pub(super) fn manticore_fields(source: Option<&Value>, requested_fields: &[String]) -> Value {
  let source = source.and_then(Value::as_object);
  Value::Object(
    requested_fields
      .iter()
      .filter_map(|field| {
        let mut value = source?.get(field)?.clone();
        if matches!(field.as_str(), "created_at" | "updated_at")
          && let Some(seconds) = value.as_i64()
        {
          value = json!(seconds * 1_000);
        } else if let Some(encoded) = value.as_str()
          && encoded.starts_with('[')
          && let Ok(decoded) = serde_json::from_str(encoded)
        {
          value = decoded;
        }
        if !value.is_array() {
          value = Value::Array(vec![value]);
        }
        Some((field.clone(), value))
      })
      .collect(),
  )
}

fn normalize_manticore_terms(
  value: &mut Value,
  token_ids: &std::collections::HashMap<String, i64>,
) -> RuntimeResult<()> {
  if let Some(term) = manticore_term(value, token_ids)? {
    *value = term;
    return Ok(());
  }
  match value {
    Value::Object(object) => {
      if let Some(Value::Object(boolean)) = object.get_mut("bool")
        && boolean.get("boost").and_then(Value::as_f64) == Some(1.0)
      {
        boolean.remove("boost");
      }
      if let Some(Value::Object(terms)) = object.get_mut("terms") {
        terms.entry("order").or_insert_with(|| json!({"_count":"desc"}));
      }
      for child in object.values_mut() {
        normalize_manticore_terms(child, token_ids)?;
      }
    }
    Value::Array(array) => {
      for child in array {
        normalize_manticore_terms(child, token_ids)?;
      }
    }
    _ => {}
  }
  Ok(())
}

fn manticore_term(value: &Value, token_ids: &std::collections::HashMap<String, i64>) -> RuntimeResult<Option<Value>> {
  let Some(term) = value.get("term").and_then(Value::as_object) else {
    return Ok(None);
  };
  if term.len() != 1 {
    return Ok(None);
  }
  let Some((field, clause)) = term.iter().next() else {
    return Ok(None);
  };
  let value = clause.get("value").unwrap_or(clause);
  Ok(match value {
    Value::String(value) => {
      if matches!(field.as_str(), "acl_read_tokens" | "ref_doc_id") {
        let token_id = token_ids
          .get(value)
          .copied()
          .ok_or_else(|| RuntimeError::invalid_state("Manticore exact token mapping is incomplete"))?;
        let field = if field == "acl_read_tokens" {
          "acl_read_token_ids"
        } else {
          "ref_doc_token_ids"
        };
        return Ok(Some(json!({"equals":{field:token_id}})));
      }
      let (field, value) = match field.as_str() {
        "workspace_id" => ("workspace_token", super::super::exact_token(value)),
        "doc_id" => ("doc_token", super::super::exact_token(value)),
        "block_id" => ("block_token", super::super::exact_token(value)),
        _ => (field.as_str(), value.clone()),
      };
      if let Some(boost) = clause.get("boost").and_then(Value::as_f64) {
        Some(json!({"match":{field:{"query":value,"boost":boost}}}))
      } else {
        Some(json!({"equals":{field:value}}))
      }
    }
    Value::Bool(value) => Some(json!({"equals":{field:u8::from(*value)}})),
    Value::Number(value) => Some(json!({"equals":{field:value}})),
    _ => None,
  })
}

pub(super) fn manticore_exact_tokens(value: &Value) -> Vec<String> {
  let mut tokens = Vec::new();
  collect_exact_tokens(value, &mut tokens);
  tokens
}

fn collect_exact_tokens(value: &Value, tokens: &mut Vec<String>) {
  match value {
    Value::Object(object) => {
      if let Some(token) = object
        .get("term")
        .and_then(|term| term.get("acl_read_tokens").or_else(|| term.get("ref_doc_id")))
        .and_then(|clause| clause.get("value").unwrap_or(clause).as_str())
      {
        tokens.push(token.to_string());
      }
      for field in ["acl_read_tokens", "ref_doc_id"] {
        if let Some(values) = object.get(field).and_then(Value::as_array) {
          tokens.extend(values.iter().filter_map(Value::as_str).map(str::to_string));
        }
      }
      for child in object.values() {
        collect_exact_tokens(child, tokens);
      }
    }
    Value::Array(values) => {
      for child in values {
        collect_exact_tokens(child, tokens);
      }
    }
    _ => {}
  }
}

#[cfg(test)]
mod tests {
  use super::{super::super::exact_token, *};

  #[test]
  fn payload_and_fields_preserve_terminal_types() {
    let mut payload = json!({
      "content":["hello","world"],
      "ref_doc_id":["doc-a","doc-b"],
      "summary":null,
      "created_at":2_000,
      "updated_at":3_000,
      "acl_read_tokens":["member"]
    });
    prepare_manticore_payload(
      &mut payload,
      &[
        ("member".to_string(), 7),
        ("doc-a".to_string(), 8),
        ("doc-b".to_string(), 9),
      ]
      .into_iter()
      .collect(),
    )
    .unwrap();
    assert_eq!(payload["content"], "hello world");
    assert_eq!(payload["ref_doc_id"], "[\"doc-a\",\"doc-b\"]");
    assert_eq!(payload["summary"], "");
    assert_eq!(payload["created_at"], 2);
    assert_eq!(payload["acl_read_token_ids"], json!([7]));
    assert_eq!(payload["ref_doc_token_ids"], json!([8, 9]));

    let fields = manticore_fields(
      Some(&payload),
      &[
        "ref_doc_id".to_string(),
        "summary".to_string(),
        "updated_at".to_string(),
      ],
    );
    assert_eq!(fields["ref_doc_id"], json!(["doc-a", "doc-b"]));
    assert_eq!(fields["summary"], json!([""]));
    assert_eq!(fields["updated_at"], json!([3_000]));
  }

  #[test]
  fn nested_terms_use_exact_identity_and_acl_tokens() {
    let mut dsl = json!({"query":{"bool":{"must":[
      {"term":{"workspace_id":{"value":"workspace","boost":2.0}}},
      {"bool":{"must_not":[{"term":{"doc_id":{"value":"doc"}}}]}},
      {"term":{"acl_read_tokens":{"value":"member"}}},
      {"term":{"ref_doc_id":{"value":"ref-doc"}}}
    ],"boost":1.0}}});
    normalize_manticore_terms(
      &mut dsl,
      &[("member".to_string(), 9), ("ref-doc".to_string(), 10)]
        .into_iter()
        .collect(),
    )
    .unwrap();
    assert_eq!(
      dsl,
      json!({"query":{"bool":{"must":[
        {"match":{"workspace_token":{"query":exact_token("workspace"),"boost":2.0}}},
        {"bool":{"must_not":[{"equals":{"doc_token":exact_token("doc")}}]}},
        {"equals":{"acl_read_token_ids":9}},
        {"equals":{"ref_doc_token_ids":10}}
      ]}}})
    );
  }
}
