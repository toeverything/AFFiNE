use serde::{Deserialize, Serialize};

use crate::runtime::{RuntimeError, RuntimeResult};

#[napi_derive::napi(string_enum = "snake_case")]
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchTable {
  Doc,
  Block,
}

impl SearchTable {
  pub(super) fn as_str(self) -> &'static str {
    match self {
      Self::Doc => "doc",
      Self::Block => "block",
    }
  }

  pub(super) fn text_field(self) -> &'static str {
    match self {
      Self::Doc => "title",
      Self::Block => "content",
    }
  }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SearchQuery {
  #[serde(rename = "type")]
  pub(super) query_type: String,
  pub(super) field: Option<String>,
  #[serde(rename = "match")]
  pub(super) match_value: Option<String>,
  pub(super) query: Option<Box<SearchQuery>>,
  pub(super) queries: Option<Vec<SearchQuery>>,
  pub(super) occur: Option<String>,
  pub(super) boost: Option<f64>,
}

#[napi_derive::napi(object)]
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPagination {
  pub limit: Option<u32>,
  pub skip: Option<u32>,
  pub cursor: Option<String>,
}

#[napi_derive::napi(object)]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHighlight {
  pub field: String,
  pub before: String,
  pub end: String,
}

#[napi_derive::napi(object)]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
  pub fields: Vec<String>,
  #[serde(default)]
  pub highlights: Vec<SearchHighlight>,
  #[serde(default)]
  pub pagination: SearchPagination,
}

#[napi_derive::napi(object)]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AggregateHitsOptions {
  pub fields: Vec<String>,
  #[serde(default)]
  pub highlights: Vec<SearchHighlight>,
  #[serde(default)]
  pub pagination: SearchPagination,
}

#[napi_derive::napi(object)]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AggregateOptions {
  pub hits: AggregateHitsOptions,
  #[serde(default)]
  pub pagination: SearchPagination,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AggregateRequest {
  pub(super) table: SearchTable,
  pub(super) query: SearchQuery,
  pub(super) field: String,
  pub(super) options: AggregateOptions,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SearchRequest {
  pub(super) table: SearchTable,
  pub(super) query: SearchQuery,
  pub(super) options: SearchOptions,
}

#[napi_derive::napi(object)]
pub struct RuntimeSearchQuery {
  pub query_type: String,
  pub field: Option<String>,
  pub match_value: Option<String>,
  pub query: Option<u32>,
  pub queries: Option<Vec<u32>>,
  pub occur: Option<String>,
  pub boost: Option<f64>,
}

#[napi_derive::napi(object)]
pub struct RuntimeSearchRequest {
  pub table: SearchTable,
  pub queries: Vec<RuntimeSearchQuery>,
  pub root_query: u32,
  pub options: SearchOptions,
}

#[napi_derive::napi(object)]
pub struct RuntimeAggregateRequest {
  pub table: SearchTable,
  pub queries: Vec<RuntimeSearchQuery>,
  pub root_query: u32,
  pub field: String,
  pub options: AggregateOptions,
}

#[cfg(test)]
impl SearchRequest {
  pub(super) fn parse(value: serde_json::Value) -> RuntimeResult<Self> {
    serde_json::from_value(value).map_err(|error| RuntimeError::json("invalid search request", error))
  }
}

impl RuntimeSearchRequest {
  pub(super) fn into_search_request(self) -> RuntimeResult<SearchRequest> {
    let mut decoded_nodes = 0;
    Ok(SearchRequest {
      table: self.table,
      query: decode_query(&self.queries, self.root_query, 0, &mut decoded_nodes)?,
      options: self.options,
    })
  }
}

impl RuntimeAggregateRequest {
  pub(super) fn into_aggregate_request(self) -> RuntimeResult<AggregateRequest> {
    let mut decoded_nodes = 0;
    Ok(AggregateRequest {
      table: self.table,
      query: decode_query(&self.queries, self.root_query, 0, &mut decoded_nodes)?,
      field: self.field,
      options: self.options,
    })
  }
}

const MAX_QUERY_GRAPH_NODES: usize = 100;
const MAX_QUERY_DEPTH: usize = 100;
const MAX_DECODED_QUERY_NODES: usize = 1_000;

fn decode_query(
  nodes: &[RuntimeSearchQuery],
  index: u32,
  depth: usize,
  decoded_nodes: &mut usize,
) -> RuntimeResult<SearchQuery> {
  if nodes.len() > MAX_QUERY_GRAPH_NODES || depth > MAX_QUERY_DEPTH || *decoded_nodes >= MAX_DECODED_QUERY_NODES {
    return Err(RuntimeError::invalid_input("search query is too complex"));
  }
  *decoded_nodes += 1;
  let node = nodes
    .get(index as usize)
    .ok_or_else(|| RuntimeError::invalid_input("invalid search query node"))?;
  Ok(SearchQuery {
    query_type: node.query_type.clone(),
    field: node.field.clone(),
    match_value: node.match_value.clone(),
    query: node
      .query
      .map(|index| decode_query(nodes, index, depth + 1, decoded_nodes).map(Box::new))
      .transpose()?,
    queries: node
      .queries
      .as_ref()
      .map(|indices| {
        indices
          .iter()
          .map(|index| decode_query(nodes, *index, depth + 1, decoded_nodes))
          .collect()
      })
      .transpose()?,
    occur: node.occur.clone(),
    boost: node.boost,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  fn node(query_type: &str) -> RuntimeSearchQuery {
    RuntimeSearchQuery {
      query_type: query_type.to_string(),
      field: None,
      match_value: None,
      query: None,
      queries: None,
      occur: None,
      boost: None,
    }
  }

  #[test]
  fn rejects_invalid_or_overly_complex_query_graphs() {
    assert!(decode_query(&[node("all")], 1, 0, &mut 0).is_err());

    let mut oversized = (0..101).map(|_| node("all")).collect::<Vec<_>>();
    oversized[0].query = Some(1);
    assert!(decode_query(&oversized, 0, 0, &mut 0).is_err());

    let mut recursive = vec![node("boost")];
    recursive[0].query = Some(0);
    assert!(decode_query(&recursive, 0, 0, &mut 0).is_err());

    let mut shared_child = (0..100).map(|_| node("boolean")).collect::<Vec<_>>();
    for (index, node) in shared_child.iter_mut().enumerate().take(99) {
      node.queries = Some(vec![(index + 1) as u32, (index + 1) as u32]);
    }
    assert!(decode_query(&shared_child, 0, 0, &mut 0).is_err());
  }
}
