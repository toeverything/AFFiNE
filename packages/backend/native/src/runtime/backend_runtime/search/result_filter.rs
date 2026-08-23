use std::collections::BTreeSet;

use serde_json::{Value, json};

use crate::runtime::{RuntimeError, RuntimeResult};

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub(super) struct CandidateTuple {
  pub(super) doc_id: String,
  pub(super) source_version: i64,
  pub(super) permission_version: i64,
}

pub(super) fn candidates(result: &Value) -> RuntimeResult<Vec<CandidateTuple>> {
  let mut candidates = Vec::new();
  for node in result_nodes(result)? {
    candidates.push(candidate(node)?);
  }
  candidates.sort();
  candidates.dedup();
  Ok(candidates)
}

pub(super) fn retain_visible_nodes(result: &mut Value, visible: &BTreeSet<CandidateTuple>) -> RuntimeResult<()> {
  if let Some(nodes) = result.get_mut("nodes").and_then(Value::as_array_mut) {
    retain_nodes(nodes, visible)?;
    result["total"] = json!(nodes.len());
    return Ok(());
  }
  let buckets = result
    .get_mut("buckets")
    .and_then(Value::as_array_mut)
    .ok_or_else(|| RuntimeError::invalid_state("invalid provider response"))?;
  for bucket in buckets.iter_mut() {
    let count = {
      let nodes = bucket
        .pointer_mut("/hits/nodes")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| RuntimeError::invalid_state("invalid provider aggregate response"))?;
      retain_nodes(nodes, visible)?;
      nodes.len()
    };
    bucket["count"] = json!(count);
    bucket["hits"]["total"] = json!(count);
  }
  buckets.retain(|bucket| {
    bucket
      .pointer("/hits/nodes")
      .and_then(Value::as_array)
      .is_some_and(|nodes| !nodes.is_empty())
  });
  result["total"] = json!(buckets.len());
  Ok(())
}

fn result_nodes(result: &Value) -> RuntimeResult<Vec<&Value>> {
  if let Some(nodes) = result.get("nodes").and_then(Value::as_array) {
    return Ok(nodes.iter().collect());
  }
  let buckets = result
    .get("buckets")
    .and_then(Value::as_array)
    .ok_or_else(|| RuntimeError::invalid_state("invalid provider response"))?;
  buckets
    .iter()
    .map(|bucket| {
      bucket
        .pointer("/hits/nodes")
        .and_then(Value::as_array)
        .ok_or_else(|| RuntimeError::invalid_state("invalid provider aggregate response"))
    })
    .collect::<RuntimeResult<Vec<_>>>()
    .map(|buckets| buckets.into_iter().flatten().collect())
}

fn retain_nodes(nodes: &mut Vec<Value>, visible: &BTreeSet<CandidateTuple>) -> RuntimeResult<()> {
  let mut decoded = Vec::with_capacity(nodes.len());
  for node in nodes.iter() {
    decoded.push(candidate(node)?);
  }
  let mut index = 0;
  nodes.retain(|_| {
    let keep = visible.contains(&decoded[index]);
    index += 1;
    keep
  });
  Ok(())
}

fn candidate(node: &Value) -> RuntimeResult<CandidateTuple> {
  Ok(CandidateTuple {
    doc_id: string_field(node, "doc_id")?.to_string(),
    source_version: integer_field(node, "source_version")?,
    permission_version: integer_field(node, "permission_version")?,
  })
}

fn string_field<'a>(node: &'a Value, field: &str) -> RuntimeResult<&'a str> {
  node
    .pointer(&format!("/fields/{field}/0"))
    .and_then(Value::as_str)
    .or_else(|| node.pointer(&format!("/_source/{field}")).and_then(Value::as_str))
    .ok_or_else(|| RuntimeError::invalid_state(format!("provider result is missing {field}")))
}

fn integer_field(node: &Value, field: &str) -> RuntimeResult<i64> {
  node
    .pointer(&format!("/fields/{field}/0"))
    .and_then(Value::as_i64)
    .or_else(|| node.pointer(&format!("/_source/{field}")).and_then(Value::as_i64))
    .filter(|version| *version >= 0)
    .ok_or_else(|| RuntimeError::invalid_state(format!("provider result has invalid {field}")))
}

#[cfg(test)]
mod tests {
  use serde_json::json;

  use super::{CandidateTuple, candidates, retain_visible_nodes};

  #[test]
  fn canonical_filter_requires_the_published_projection_tuple() {
    let mut result = json!({
      "total": 8,
      "nextCursor": "{\"offset\":2}",
      "nodes": [
        {"fields":{"doc_id":["readable"],"source_version":[2],"permission_version":[3]}},
        {"_source":{"doc_id":"readable","source_version":1,"permission_version":3}}
      ]
    });
    assert_eq!(candidates(&result).unwrap().len(), 2);
    retain_visible_nodes(
      &mut result,
      &[CandidateTuple {
        doc_id: "readable".to_string(),
        source_version: 2,
        permission_version: 3,
      }]
      .into_iter()
      .collect(),
    )
    .unwrap();
    assert_eq!(result["total"], 1);
    assert_eq!(result["nodes"].as_array().unwrap().len(), 1);
    assert_eq!(result["nextCursor"], "{\"offset\":2}");
  }

  #[test]
  fn malformed_provider_tuple_fails_closed() {
    assert!(candidates(&json!({"nodes":[{"_source":{"doc_id":"doc"}}]})).is_err());
  }
}
