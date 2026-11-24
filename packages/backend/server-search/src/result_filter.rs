use std::collections::BTreeSet;

use serde_json::{Value, json};

use crate::error::{SearchError, SearchResult};

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct CandidateTuple {
  pub doc_id: String,
  pub source_version: i64,
  pub permission_version: i64,
}

pub fn candidates(result: &Value) -> SearchResult<Vec<CandidateTuple>> {
  let mut list = Vec::new();
  for node in result_nodes(result)? {
    list.push(candidate(node)?);
  }
  list.sort();
  list.dedup();
  Ok(list)
}

pub fn retain_visible_nodes(result: &mut Value, visible: &BTreeSet<CandidateTuple>) -> SearchResult<()> {
  if let Some(nodes) = result.get_mut("nodes").and_then(Value::as_array_mut) {
    retain_nodes(nodes, visible)?;
    result["total"] = json!(nodes.len());
    return Ok(());
  }
  let buckets = result
    .get_mut("buckets")
    .and_then(Value::as_array_mut)
    .ok_or_else(|| SearchError::invalid_state("invalid provider response"))?;
  for bucket in buckets.iter_mut() {
    let count = {
      let nodes = bucket
        .pointer_mut("/hits/nodes")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| SearchError::invalid_state("invalid provider aggregate response"))?;
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

fn result_nodes(result: &Value) -> SearchResult<Vec<&Value>> {
  if let Some(nodes) = result.get("nodes").and_then(Value::as_array) {
    return Ok(nodes.iter().collect());
  }
  let buckets = result
    .get("buckets")
    .and_then(Value::as_array)
    .ok_or_else(|| SearchError::invalid_state("invalid provider response"))?;
  buckets
    .iter()
    .map(|bucket| {
      bucket
        .pointer("/hits/nodes")
        .and_then(Value::as_array)
        .ok_or_else(|| SearchError::invalid_state("invalid provider aggregate response"))
    })
    .collect::<SearchResult<Vec<_>>>()
    .map(|buckets| buckets.into_iter().flatten().collect())
}

fn retain_nodes(nodes: &mut Vec<Value>, visible: &BTreeSet<CandidateTuple>) -> SearchResult<()> {
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

fn candidate(node: &Value) -> SearchResult<CandidateTuple> {
  Ok(CandidateTuple {
    doc_id: string_field(node, "doc_id")?.to_owned(),
    source_version: integer_field(node, "source_version")?,
    permission_version: integer_field(node, "permission_version")?,
  })
}

fn string_field<'a>(node: &'a Value, field: &str) -> SearchResult<&'a str> {
  node
    .pointer(&format!("/fields/{field}/0"))
    .and_then(Value::as_str)
    .or_else(|| node.pointer(&format!("/_source/{field}")).and_then(Value::as_str))
    .ok_or_else(|| SearchError::invalid_state(format!("provider result is missing {field}")))
}

fn integer_field(node: &Value, field: &str) -> SearchResult<i64> {
  node
    .pointer(&format!("/fields/{field}/0"))
    .and_then(Value::as_i64)
    .or_else(|| node.pointer(&format!("/_source/{field}")).and_then(Value::as_i64))
    .filter(|version| *version >= 0)
    .ok_or_else(|| SearchError::invalid_state(format!("provider result has invalid {field}")))
}
