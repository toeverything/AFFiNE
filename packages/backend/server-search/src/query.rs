use serde_json::{Value, json};

use crate::acl::{AuthorizedSearchScope, DocReadScope};
use crate::error::{SearchError, SearchResult};
use crate::types::{AggregateRequest, SearchOptions, SearchQuery, SearchRequest, SearchTable};

const MAX_QUERY_DEPTH: usize = 100;
const MAX_QUERY_NODES: usize = 1_000;

pub fn compile(request: &SearchRequest, scope: &AuthorizedSearchScope) -> SearchResult<Value> {
  let mut node_count = 0usize;
  let query = compile_query(request.table, &request.query, 0, &mut node_count)?;
  let mut must = vec![json!({"term": {"workspace_id": {"value": scope.workspace_id}}}), query];
  if let DocReadScope::ProjectedAcl(predicate) = &scope.docs {
    let mut should =
      vec![json!({"term": {"acl_read_tokens": {"value": crate::exact_token(&predicate.actor_user_id)}}})];
    if predicate.active_member {
      should.push(json!({"term": {"acl_read_tokens": {"value": "member"}}}));
    }
    if predicate.sharing_enabled {
      should.push(json!({"term": {"acl_read_tokens": {"value": "public"}}}));
    }
    must.push(json!({"bool": {"should": should}}));
  }
  let fields = request
    .options
    .fields
    .iter()
    .map(|field| validate_field(request.table, field).map(str::to_owned))
    .collect::<SearchResult<Vec<_>>>()?;
  let mut dsl = json!({
    "_source": ["workspace_id", "doc_id", "source_version", "permission_version"],
    "fields": fields,
    "query": {"bool": {"must": must}},
    "sort": stable_sort(request.table),
  });
  let pagination = &request.options.pagination;
  if pagination.limit.unwrap_or(10) > 10_000 {
    return Err(SearchError::invalid_input("search limit exceeds 10000"));
  }
  dsl["size"] = json!(pagination.limit.unwrap_or(10));
  if let Some(skip) = pagination.skip {
    if skip.saturating_add(pagination.limit.unwrap_or(10)) > 10_000 {
      return Err(SearchError::invalid_input("search offset exceeds 10000"));
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
        field.to_owned(),
        json!({"pre_tags": [highlight.before], "post_tags": [highlight.end]}),
      );
    }
    dsl["highlight"] = json!({"fields": highlights});
  }
  Ok(dsl)
}

pub fn compile_aggregate(request: &AggregateRequest, scope: &AuthorizedSearchScope) -> SearchResult<Value> {
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
    return Err(SearchError::invalid_input("aggregate pagination exceeds 10000"));
  }
  if request.options.pagination.cursor.is_some() {
    return Err(SearchError::invalid_input("aggregate cursor is unsupported"));
  }
  Ok(json!({
    "query": hit_dsl["query"],
    "from": skip,
    "size": 0,
    "aggs": {"result": {"terms": {"field": field, "size": limit}, "aggs": {"result": {"top_hits": {
      "size": hit_dsl["size"],
      "from": hit_dsl.get("from").cloned().unwrap_or_else(|| json!(0)),
      "_source": hit_dsl["_source"],
      "fields": hit_dsl["fields"],
      "sort": hit_dsl["sort"],
      "highlight": hit_dsl.get("highlight").cloned().unwrap_or_else(|| json!({}))
    }}}}}
  }))
}

fn compile_query(table: SearchTable, query: &SearchQuery, depth: usize, nodes: &mut usize) -> SearchResult<Value> {
  if depth > MAX_QUERY_DEPTH || *nodes >= MAX_QUERY_NODES {
    return Err(SearchError::invalid_input("search query is too complex"));
  }
  *nodes += 1;
  let boost = query.boost.unwrap_or(1.0);
  if !boost.is_finite() || boost <= 0.0 {
    return Err(SearchError::invalid_input("invalid search boost"));
  }
  match query.query_type.as_str() {
    "match" => {
      let field = validate_field(
        table,
        query
          .field
          .as_deref()
          .ok_or_else(|| SearchError::invalid_input("match field is required"))?,
      )?;
      let value = query
        .match_value
        .as_deref()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| SearchError::invalid_input("match value is required"))?;
      if field == table.text_field() {
        Ok(json!({"match": {field: {"query": value, "boost": boost}}}))
      } else {
        Ok(json!({"term": {field: {"value": value, "boost": boost}}}))
      }
    }
    "boolean" => {
      let occur = query
        .occur
        .as_deref()
        .filter(|occur| matches!(*occur, "must" | "should" | "must_not"))
        .ok_or_else(|| SearchError::invalid_input("invalid boolean occurrence"))?;
      let clauses = query
        .queries
        .as_deref()
        .ok_or_else(|| SearchError::invalid_input("boolean queries are required"))?
        .iter()
        .map(|clause| compile_query(table, clause, depth + 1, nodes))
        .collect::<SearchResult<Vec<_>>>()?;
      Ok(json!({"bool": {occur: clauses, "boost": boost}}))
    }
    "exists" => {
      let field = validate_field(
        table,
        query
          .field
          .as_deref()
          .ok_or_else(|| SearchError::invalid_input("exists field is required"))?,
      )?;
      Ok(json!({"exists": {"field": field, "boost": boost}}))
    }
    "all" => Ok(json!({"match_all": {"boost": boost}})),
    "boost" => {
      let mut nested = query
        .query
        .as_deref()
        .ok_or_else(|| SearchError::invalid_input("boost query is required"))?
        .clone();
      nested.boost = Some(boost);
      compile_query(table, &nested, depth + 1, nodes)
    }
    _ => Err(SearchError::invalid_input("unsupported search query")),
  }
}

fn stable_sort(table: SearchTable) -> Value {
  match table {
    SearchTable::Doc => json!(["_score", {"updated_at": "desc"}, "doc_id"]),
    SearchTable::Block => json!(["_score", {"updated_at": "desc"}, "doc_id", "block_id"]),
  }
}

pub fn validate_field(table: SearchTable, field: &str) -> SearchResult<&'static str> {
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
    .ok_or_else(|| SearchError::invalid_input("unknown or internal search field"))
}
