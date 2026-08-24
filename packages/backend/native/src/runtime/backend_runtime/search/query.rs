use serde::Deserialize;
use serde_json::{Value, json};

use super::{
  AggregateOptions, AuthorizedSearchScope, DocReadScope, RuntimeAggregateRequest, RuntimeSearchQuery,
  RuntimeSearchRequest, SearchOptions, SearchTable,
};
use crate::runtime::{RuntimeError, RuntimeResult};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AggregateRequest {
  pub(super) table: SearchTable,
  query: SearchQuery,
  field: String,
  options: AggregateOptions,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SearchRequest {
  pub(super) table: SearchTable,
  query: SearchQuery,
  options: SearchOptions,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SearchQuery {
  #[serde(rename = "type")]
  query_type: String,
  field: Option<String>,
  #[serde(rename = "match")]
  match_value: Option<String>,
  query: Option<Box<SearchQuery>>,
  queries: Option<Vec<SearchQuery>>,
  occur: Option<String>,
  boost: Option<f64>,
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

pub(super) fn compile(request: &SearchRequest, scope: &AuthorizedSearchScope) -> RuntimeResult<Value> {
  let query = compile_query(request.table, &request.query)?;
  let mut must = vec![json!({"term":{"workspace_id":{"value":scope.workspace_id}}}), query];
  if let DocReadScope::ProjectedAcl(predicate) = &scope.docs {
    let mut should = vec![json!({"term":{"acl_read_tokens":{"value":super::exact_token(&predicate.actor_user_id)}}})];
    if predicate.active_member {
      should.push(json!({"term":{"acl_read_tokens":{"value":"member"}}}));
    }
    if predicate.sharing_enabled {
      should.push(json!({"term":{"acl_read_tokens":{"value":"public"}}}));
    }
    must.push(json!({"bool":{"should":should}}));
  }
  let fields = request
    .options
    .fields
    .iter()
    .map(|field| validate_field(request.table, field).map(str::to_string))
    .collect::<RuntimeResult<Vec<_>>>()?;
  let mut dsl = json!({
    "_source":["workspace_id","doc_id","source_version","permission_version"],
    "fields":fields,
    "query":{"bool":{"must":must}},
    "sort": stable_sort(request.table),
  });
  let pagination = &request.options.pagination;
  if pagination.limit.unwrap_or(10) > 10_000 {
    return Err(RuntimeError::invalid_input("search limit exceeds 10000"));
  }
  dsl["size"] = json!(pagination.limit.unwrap_or(10));
  if let Some(skip) = pagination.skip {
    if skip.saturating_add(pagination.limit.unwrap_or(10)) > 10_000 {
      return Err(RuntimeError::invalid_input("search offset exceeds 10000"));
    }
    dsl["from"] = json!(skip);
  }
  if let Some(cursor) = &pagination.cursor {
    dsl["cursor"] = json!(cursor);
  }
  if !request.options.highlights.is_empty() {
    let mut highlights = serde_json::Map::new();
    for highlight in &request.options.highlights {
      let field = validate_field(request.table, &highlight.field)?;
      highlights.insert(
        field.to_string(),
        json!({"pre_tags":[highlight.before],"post_tags":[highlight.end]}),
      );
    }
    dsl["highlight"] = json!({"fields":highlights});
  }
  Ok(dsl)
}

pub(super) fn compile_aggregate(request: &AggregateRequest, scope: &AuthorizedSearchScope) -> RuntimeResult<Value> {
  let hits = SearchOptions {
    fields: request.options.hits.fields.clone(),
    highlights: request.options.hits.highlights.clone(),
    pagination: request.options.hits.pagination.clone(),
  };
  let search = SearchRequest {
    table: request.table,
    query: request.query.clone(),
    options: hits,
  };
  let hit_dsl = compile(&search, scope)?;
  let field = validate_field(request.table, &request.field)?;
  let limit = request.options.pagination.limit.unwrap_or(10);
  let skip = request.options.pagination.skip.unwrap_or(0);
  if skip.saturating_add(limit) > 10_000 {
    return Err(RuntimeError::invalid_input("aggregate pagination exceeds 10000"));
  }
  if request.options.pagination.cursor.is_some() {
    return Err(RuntimeError::invalid_input("aggregate cursor is unsupported"));
  }
  Ok(json!({
    "query":hit_dsl["query"],
    "from":skip,
    "size":0,
    "aggs":{"result":{"terms":{"field":field,"size":limit},"aggs":{"result":{"top_hits":{
      "size":hit_dsl["size"],"from":hit_dsl.get("from").cloned().unwrap_or_else(||json!(0)),"_source":hit_dsl["_source"],"fields":hit_dsl["fields"],
      "sort":hit_dsl["sort"],"highlight":hit_dsl.get("highlight").cloned().unwrap_or_else(||json!({}))
    }}}}}
  }))
}

fn compile_query(table: SearchTable, query: &SearchQuery) -> RuntimeResult<Value> {
  let boost = query.boost.unwrap_or(1.0);
  if !boost.is_finite() || boost <= 0.0 {
    return Err(RuntimeError::invalid_input("invalid search boost"));
  }
  match query.query_type.as_str() {
    "match" => {
      let field = validate_field(
        table,
        query
          .field
          .as_deref()
          .ok_or_else(|| RuntimeError::invalid_input("match field is required"))?,
      )?;
      let value = query
        .match_value
        .as_deref()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| RuntimeError::invalid_input("match value is required"))?;
      if field == table.text_field() {
        Ok(json!({"match":{field:{"query":value,"boost":boost}}}))
      } else {
        Ok(json!({"term":{field:{"value":value,"boost":boost}}}))
      }
    }
    "boolean" => {
      let occur = query
        .occur
        .as_deref()
        .filter(|occur| matches!(*occur, "must" | "should" | "must_not"))
        .ok_or_else(|| RuntimeError::invalid_input("invalid boolean occurrence"))?;
      let clauses = query
        .queries
        .as_deref()
        .ok_or_else(|| RuntimeError::invalid_input("boolean queries are required"))?
        .iter()
        .map(|query| compile_query(table, query))
        .collect::<RuntimeResult<Vec<_>>>()?;
      Ok(json!({"bool":{occur:clauses,"boost":boost}}))
    }
    "exists" => {
      let field = validate_field(
        table,
        query
          .field
          .as_deref()
          .ok_or_else(|| RuntimeError::invalid_input("exists field is required"))?,
      )?;
      Ok(json!({"exists":{"field":field,"boost":boost}}))
    }
    "all" => Ok(json!({"match_all":{"boost":boost}})),
    "boost" => {
      let mut nested = query
        .query
        .as_deref()
        .ok_or_else(|| RuntimeError::invalid_input("boost query is required"))?
        .clone();
      nested.boost = Some(boost);
      compile_query(table, &nested)
    }
    _ => Err(RuntimeError::invalid_input("unsupported search query")),
  }
}

fn stable_sort(table: SearchTable) -> Value {
  match table {
    SearchTable::Doc => json!(["_score", {"updated_at":"desc"}, "doc_id"]),
    SearchTable::Block => json!(["_score", {"updated_at":"desc"}, "doc_id", "block_id"]),
  }
}

fn validate_field(table: SearchTable, field: &str) -> RuntimeResult<&'static str> {
  let normalized = match field {
    "workspaceId" => "workspace_id",
    "docId" => "doc_id",
    "blockId" => "block_id",
    "createdByUserId" => "created_by_user_id",
    "updatedByUserId" => "updated_by_user_id",
    "createdAt" => "created_at",
    "updatedAt" => "updated_at",
    "refDocId" => "ref_doc_id",
    "parentFlavour" => "parent_flavour",
    "parentBlockId" => "parent_block_id",
    "unitId" => "unit_id",
    "projectionVersion" => "projection_version",
    "sourceHash" => "source_hash",
    "elementId" => "element_id",
    "frameId" => "frame_id",
    "sourceBlockId" => "source_block_id",
    "markdownPreview" => "markdown_preview",
    value => value,
  };
  let allowed = match table {
    SearchTable::Doc => [
      "workspace_id",
      "doc_id",
      "title",
      "summary",
      "journal",
      "created_by_user_id",
      "updated_by_user_id",
      "created_at",
      "updated_at",
    ]
    .as_slice(),
    SearchTable::Block => [
      "workspace_id",
      "doc_id",
      "block_id",
      "unit_id",
      "projection_version",
      "source_hash",
      "visibility",
      "element_id",
      "frame_id",
      "source_block_id",
      "content",
      "flavour",
      "blob",
      "ref_doc_id",
      "ref",
      "parent_flavour",
      "parent_block_id",
      "additional",
      "markdown_preview",
      "created_by_user_id",
      "updated_by_user_id",
      "created_at",
      "updated_at",
    ]
    .as_slice(),
  };
  allowed
    .iter()
    .find(|candidate| **candidate == normalized)
    .copied()
    .ok_or_else(|| RuntimeError::invalid_input("unknown or internal search field"))
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::runtime::backend_runtime::permission::{AuthorizedSearchScope, DocReadScope};

  fn scope() -> AuthorizedSearchScope {
    AuthorizedSearchScope {
      workspace_id: "workspace".to_string(),
      docs: DocReadScope::All,
    }
  }

  fn request(query: Value) -> SearchRequest {
    serde_json::from_value(json!({
      "table": "block",
      "query": query,
      "options": {
        "fields": ["docId", "createdAt"],
        "highlights": [{"field": "content", "before": "<b>", "end": "</b>"}],
        "pagination": {"limit": 20, "skip": 5}
      }
    }))
    .unwrap()
  }

  #[test]
  fn compiles_supported_query_variants_and_options() {
    let cases = [
      (json!({"type":"all"}), json!({"match_all":{"boost":1.0}})),
      (
        json!({"type":"exists","field":"refDocId"}),
        json!({"exists":{"field":"ref_doc_id","boost":1.0}}),
      ),
      (
        json!({"type":"boost","boost":2.5,"query":{"type":"match","field":"content","match":"hello"}}),
        json!({"match":{"content":{"query":"hello","boost":2.5}}}),
      ),
      (
        json!({"type":"boolean","occur":"must_not","queries":[{"type":"match","field":"docId","match":"doc"}]}),
        json!({"bool":{"must_not":[{"term":{"doc_id":{"value":"doc","boost":1.0}}}],"boost":1.0}}),
      ),
    ];
    for (query, expected) in cases {
      let dsl = compile(&request(query), &scope()).unwrap();
      assert_eq!(dsl["query"]["bool"]["must"][1], expected);
      assert_eq!(dsl["fields"], json!(["doc_id", "created_at"]));
      assert_eq!(dsl["from"], 5);
      assert_eq!(dsl["size"], 20);
      assert_eq!(
        dsl["highlight"]["fields"]["content"],
        json!({"pre_tags":["<b>"],"post_tags":["</b>"]})
      );
    }
  }

  #[test]
  fn validates_query_fields_and_pagination_limits() {
    for query in [
      json!({"type":"match","field":"aclReadTokens","match":"member"}),
      json!({"type":"exists","field":"unknown"}),
      json!({"type":"boolean","occur":"invalid","queries":[]}),
      json!({"type":"boost","boost":0,"query":{"type":"all"}}),
    ] {
      assert!(compile(&request(query), &scope()).is_err());
    }

    let mut oversized = request(json!({"type":"all"}));
    oversized.options.pagination.limit = Some(10_001);
    assert!(compile(&oversized, &scope()).is_err());
    oversized.options.pagination.limit = Some(10_000);
    oversized.options.pagination.skip = Some(1);
    assert!(compile(&oversized, &scope()).is_err());
  }

  #[test]
  fn compiles_aggregate_contract_and_rejects_invalid_fields() {
    let aggregate: AggregateRequest = serde_json::from_value(json!({
      "table":"block",
      "query":{"type":"match","field":"content","match":"hello"},
      "field":"docId",
      "options":{
        "hits":{
          "fields":["docId","content"],
          "highlights":[{"field":"content","before":"<b>","end":"</b>"}],
          "pagination":{"limit":2}
        },
        "pagination":{"limit":50,"skip":3}
      }
    }))
    .unwrap();
    let dsl = compile_aggregate(&aggregate, &scope()).unwrap();
    assert_eq!(dsl["from"], 3);
    assert_eq!(dsl["aggs"]["result"]["terms"], json!({"field":"doc_id","size":50}));
    assert_eq!(dsl["aggs"]["result"]["aggs"]["result"]["top_hits"]["size"], 2);
    assert_eq!(
      dsl["aggs"]["result"]["aggs"]["result"]["top_hits"]["highlight"]["fields"]["content"],
      json!({"pre_tags":["<b>"],"post_tags":["</b>"]})
    );
    let mut hit_skip = aggregate.clone();
    hit_skip.options.hits.pagination.skip = Some(1);
    let hit_skip_dsl = compile_aggregate(&hit_skip, &scope()).unwrap();
    assert_eq!(hit_skip_dsl["aggs"]["result"]["aggs"]["result"]["top_hits"]["from"], 1);

    let mut invalid = aggregate;
    invalid.field = "aclReadTokens".to_string();
    assert!(compile_aggregate(&invalid, &scope()).is_err());
    invalid.field = "docId".to_string();
    invalid.options.pagination.limit = Some(10_001);
    assert!(compile_aggregate(&invalid, &scope()).is_err());
    invalid.options.pagination.limit = Some(10_000);
    invalid.options.pagination.skip = Some(1);
    assert!(compile_aggregate(&invalid, &scope()).is_err());
    invalid.options.pagination.limit = Some(10);
    invalid.options.pagination.skip = None;
    invalid.options.pagination.cursor = Some("candidate".to_string());
    assert!(compile_aggregate(&invalid, &scope()).is_err());
  }

  fn runtime_node(query_type: &str) -> RuntimeSearchQuery {
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
    assert!(decode_query(&[runtime_node("all")], 1, 0, &mut 0).is_err());

    let mut oversized = (0..101).map(|_| runtime_node("all")).collect::<Vec<_>>();
    oversized[0].query = Some(1);
    assert!(decode_query(&oversized, 0, 0, &mut 0).is_err());

    let mut recursive = vec![runtime_node("boost")];
    recursive[0].query = Some(0);
    assert!(decode_query(&recursive, 0, 0, &mut 0).is_err());

    let mut shared_child = (0..100).map(|_| runtime_node("boolean")).collect::<Vec<_>>();
    for (index, node) in shared_child.iter_mut().enumerate().take(99) {
      node.queries = Some(vec![(index + 1) as u32, (index + 1) as u32]);
    }
    assert!(decode_query(&shared_child, 0, 0, &mut 0).is_err());
  }
}
