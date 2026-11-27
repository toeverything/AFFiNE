//! GraphQL search and aggregate resolvers aligned with `v0.27.5` `schema.gql`.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use async_graphql::{Context, Enum, ErrorExtensions, InputObject, Result, SimpleObject, Value};
use chrono::{DateTime, Utc};
use serde_json::{Map, Value as JsonValue, json};
use server_search::{
  AggregateHitsOptions as DomainAggregateHitsOptions, AggregateOptions as DomainAggregateOptions,
  AggregateRequest as DomainAggregateRequest, SearchError, SearchHighlight as DomainSearchHighlight,
  SearchOptions as DomainSearchOptions, SearchPagination as DomainSearchPagination, SearchQuery as DomainSearchQuery,
  SearchRequest as DomainSearchRequest, SearchTable as DomainSearchTable,
};

use super::{JsonObjectScalar, PublicUserType, require_authenticated_user};
use crate::AppState;

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "SearchTable")]
pub enum SearchTable {
  #[graphql(name = "block")]
  Block,
  #[graphql(name = "doc")]
  Doc,
}

impl From<SearchTable> for DomainSearchTable {
  fn from(value: SearchTable) -> Self {
    match value {
      SearchTable::Block => Self::Block,
      SearchTable::Doc => Self::Doc,
    }
  }
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "SearchQueryType")]
pub enum SearchQueryType {
  #[graphql(name = "all")]
  All,
  #[graphql(name = "boolean")]
  Boolean,
  #[graphql(name = "boost")]
  Boost,
  #[graphql(name = "exists")]
  Exists,
  #[graphql(name = "match")]
  Match,
}

impl SearchQueryType {
  fn as_str(self) -> &'static str {
    match self {
      Self::All => "all",
      Self::Boolean => "boolean",
      Self::Boost => "boost",
      Self::Exists => "exists",
      Self::Match => "match",
    }
  }
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "SearchQueryOccur")]
pub enum SearchQueryOccur {
  #[graphql(name = "must")]
  Must,
  #[graphql(name = "must_not")]
  MustNot,
  #[graphql(name = "should")]
  Should,
}

impl SearchQueryOccur {
  fn as_str(self) -> &'static str {
    match self {
      Self::Must => "must",
      Self::MustNot => "must_not",
      Self::Should => "should",
    }
  }
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "SearchQuery")]
pub struct SearchQuery {
  #[graphql(name = "type")]
  pub query_type: SearchQueryType,
  pub field: Option<String>,
  #[graphql(name = "match")]
  pub match_value: Option<String>,
  pub query: Option<Box<SearchQuery>>,
  pub queries: Option<Vec<SearchQuery>>,
  pub occur: Option<SearchQueryOccur>,
  pub boost: Option<f64>,
}

impl From<SearchQuery> for DomainSearchQuery {
  fn from(q: SearchQuery) -> Self {
    Self {
      query_type: q.query_type.as_str().to_owned(),
      field: q.field,
      match_value: q.match_value,
      query: q.query.map(|nested| Box::new((*nested).into())),
      queries: q.queries.map(|list| list.into_iter().map(Into::into).collect()),
      occur: q.occur.map(|o| o.as_str().to_owned()),
      boost: q.boost,
    }
  }
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "SearchHighlight")]
pub struct SearchHighlight {
  pub field: String,
  pub before: String,
  pub end: String,
}

impl From<SearchHighlight> for DomainSearchHighlight {
  fn from(h: SearchHighlight) -> Self {
    Self {
      field: h.field,
      before: h.before,
      end: h.end,
    }
  }
}

#[derive(InputObject, Clone, Debug, Default)]
#[graphql(name = "SearchPagination")]
pub struct SearchPagination {
  pub limit: Option<i32>,
  pub skip: Option<i32>,
  pub cursor: Option<String>,
}

impl TryFrom<SearchPagination> for DomainSearchPagination {
  type Error = SearchError;

  fn try_from(p: SearchPagination) -> std::result::Result<Self, Self::Error> {
    let limit = p
      .limit
      .map(|v| u32::try_from(v).map_err(|_| SearchError::invalid_input("search limit must be non-negative")))
      .transpose()?;
    let skip = p
      .skip
      .map(|v| u32::try_from(v).map_err(|_| SearchError::invalid_input("search skip must be non-negative")))
      .transpose()?;
    Ok(Self {
      limit,
      skip,
      cursor: p.cursor,
    })
  }
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "SearchOptions")]
pub struct SearchOptions {
  pub fields: Vec<String>,
  pub highlights: Option<Vec<SearchHighlight>>,
  pub pagination: Option<SearchPagination>,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "SearchInput")]
pub struct SearchInput {
  pub table: SearchTable,
  pub query: SearchQuery,
  pub options: SearchOptions,
}

#[derive(InputObject, Clone, Debug, Default)]
#[graphql(name = "AggregateHitsPagination")]
pub struct AggregateHitsPagination {
  pub limit: Option<i32>,
  pub skip: Option<i32>,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "AggregateHitsOptions")]
pub struct AggregateHitsOptions {
  pub fields: Vec<String>,
  pub highlights: Option<Vec<SearchHighlight>>,
  pub pagination: Option<AggregateHitsPagination>,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "AggregateOptions")]
pub struct AggregateOptions {
  pub hits: AggregateHitsOptions,
  pub pagination: Option<SearchPagination>,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "AggregateInput")]
pub struct AggregateInput {
  pub table: SearchTable,
  pub query: SearchQuery,
  pub field: String,
  pub options: AggregateOptions,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "SearchDocsInput")]
pub struct SearchDocsInput {
  pub keyword: String,
  pub limit: Option<i32>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "SearchNodeObjectType")]
pub struct SearchNodeObjectType {
  pub fields: JsonObjectScalar,
  pub highlights: Option<JsonObjectScalar>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "SearchResultPagination")]
pub struct SearchResultPagination {
  pub count: i32,
  pub has_more: bool,
  pub next_cursor: Option<String>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "SearchResultObjectType")]
pub struct SearchResultObjectType {
  pub nodes: Vec<SearchNodeObjectType>,
  pub pagination: SearchResultPagination,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "AggregateBucketHitsObjectType")]
pub struct AggregateBucketHitsObjectType {
  pub nodes: Vec<SearchNodeObjectType>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "AggregateBucketObjectType")]
pub struct AggregateBucketObjectType {
  pub key: String,
  pub count: i32,
  pub hits: AggregateBucketHitsObjectType,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "AggregateResultObjectType")]
pub struct AggregateResultObjectType {
  pub buckets: Vec<AggregateBucketObjectType>,
  pub pagination: SearchResultPagination,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "SearchDocObjectType")]
pub struct SearchDocObjectType {
  pub doc_id: String,
  pub title: String,
  pub block_id: String,
  pub highlight: String,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
  pub created_by_user: Option<PublicUserType>,
  pub updated_by_user: Option<PublicUserType>,
}

pub fn search_error_to_graphql(err: &SearchError, workspace_id: &str) -> async_graphql::Error {
  let (status, code, err_type, name, message, data) = match err {
    SearchError::WorkspaceDenied => (
      403u16,
      "Forbidden",
      "NO_PERMISSION",
      "SPACE_ACCESS_DENIED",
      format!("You do not have permission to access workspace {workspace_id}."),
      Some(json!({"spaceId": workspace_id})),
    ),
    SearchError::InvalidInput(_) | SearchError::UnsupportedQuery => (
      400u16,
      "Bad Request",
      "INVALID_INPUT",
      "INVALID_INDEXER_INPUT",
      format!("Invalid indexer input: {}", err.error_code()),
      Some(json!({"reason": err.error_code()})),
    ),
    SearchError::ProviderUnavailable => (
      503u16,
      "Service Unavailable",
      "SERVICE_UNAVAILABLE",
      "SEARCH_PROVIDER_UNAVAILABLE",
      "Search provider is unavailable.".to_owned(),
      None,
    ),
    SearchError::IndexNotReady => (
      503u16,
      "Service Unavailable",
      "SERVICE_UNAVAILABLE",
      "SEARCH_INDEX_NOT_READY",
      format!("Search index for workspace {workspace_id} is not ready."),
      Some(json!({"spaceId": workspace_id})),
    ),
    SearchError::PermissionSyncing => (
      503u16,
      "Service Unavailable",
      "SERVICE_UNAVAILABLE",
      "SEARCH_PERMISSION_SYNCING",
      "Search permissions are syncing.".to_owned(),
      None,
    ),
    SearchError::IndexFailed(_) => (
      500u16,
      "Internal Server Error",
      "INTERNAL_SERVER_ERROR",
      "SEARCH_INDEX_FAILED",
      "Search index failed.".to_owned(),
      Some(json!({"diagnosticId": "search_workspace_reconcile_failed"})),
    ),
    _ => (
      500u16,
      "Internal Server Error",
      "INTERNAL_SERVER_ERROR",
      "INTERNAL_SERVER_ERROR",
      "An internal error occurred.".to_owned(),
      None,
    ),
  };
  async_graphql::Error::new(message.clone()).extend_with(|_, ext| {
    ext.set("status", status);
    ext.set("code", code);
    ext.set("type", err_type);
    ext.set("name", name);
    ext.set("message", message);
    if let Some(data) = data
      && let Ok(val) = Value::from_json(data)
    {
      ext.set("data", val);
    }
  })
}

pub(crate) async fn resolve_workspace_search(
  ctx: &Context<'_>,
  workspace_id: &str,
  input: SearchInput,
) -> Result<SearchResultObjectType> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let pagination = input
    .options
    .pagination
    .unwrap_or_default()
    .try_into()
    .map_err(|e| search_error_to_graphql(&e, workspace_id))?;
  let request = DomainSearchRequest {
    table: input.table.into(),
    query: input.query.into(),
    options: DomainSearchOptions {
      fields: input.options.fields,
      highlights: input
        .options
        .highlights
        .unwrap_or_default()
        .into_iter()
        .map(Into::into)
        .collect(),
      pagination,
    },
  };
  let raw = state
    .search
    .search_authorized(&user.id, workspace_id, request)
    .await
    .map_err(|e| search_error_to_graphql(&e, workspace_id))?;

  let mut physical_to_logical: HashMap<String, String> = HashMap::new();
  if let Ok(aliases) = state.doc_sharing.get_doc_id_aliases(workspace_id).await {
    for (logical, physical) in aliases {
      physical_to_logical.entry(physical).or_insert(logical);
    }
  }
  let nodes = format_nodes(raw.get("nodes").and_then(JsonValue::as_array), &physical_to_logical);
  let next_cursor = raw.get("nextCursor").and_then(JsonValue::as_str).map(str::to_owned);
  let count = i32::try_from(nodes.len()).unwrap_or(i32::MAX);
  let has_more = next_cursor.is_some();
  Ok(SearchResultObjectType {
    nodes,
    pagination: SearchResultPagination {
      count,
      has_more,
      next_cursor,
    },
  })
}

pub(crate) async fn resolve_workspace_aggregate(
  ctx: &Context<'_>,
  workspace_id: &str,
  input: AggregateInput,
) -> Result<AggregateResultObjectType> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let hits_pagination = input.options.hits.pagination.unwrap_or_default();
  let hits_page = DomainSearchPagination {
    limit: hits_pagination
      .limit
      .map(|v| u32::try_from(v).map_err(|_| SearchError::invalid_input("hits limit must be non-negative")))
      .transpose()
      .map_err(|e| search_error_to_graphql(&e, workspace_id))?,
    skip: hits_pagination
      .skip
      .map(|v| u32::try_from(v).map_err(|_| SearchError::invalid_input("hits skip must be non-negative")))
      .transpose()
      .map_err(|e| search_error_to_graphql(&e, workspace_id))?,
    cursor: None,
  };
  let pagination = input
    .options
    .pagination
    .unwrap_or_default()
    .try_into()
    .map_err(|e| search_error_to_graphql(&e, workspace_id))?;
  let is_doc_id_field = input.field == "docId" || input.field == "doc_id";
  let request = DomainAggregateRequest {
    table: input.table.into(),
    query: input.query.into(),
    field: input.field,
    options: DomainAggregateOptions {
      hits: DomainAggregateHitsOptions {
        fields: input.options.hits.fields,
        highlights: input
          .options
          .hits
          .highlights
          .unwrap_or_default()
          .into_iter()
          .map(Into::into)
          .collect(),
        pagination: hits_page,
      },
      pagination,
    },
  };
  let raw = state
    .search
    .aggregate_authorized(&user.id, workspace_id, request)
    .await
    .map_err(|e| search_error_to_graphql(&e, workspace_id))?;

  let mut physical_to_logical: HashMap<String, String> = HashMap::new();
  if let Ok(aliases) = state.doc_sharing.get_doc_id_aliases(workspace_id).await {
    for (logical, physical) in aliases {
      physical_to_logical.entry(physical).or_insert(logical);
    }
  }

  let mut buckets = Vec::new();
  if let Some(raw_buckets) = raw.get("buckets").and_then(JsonValue::as_array) {
    for bucket in raw_buckets {
      let raw_key = bucket
        .get("key")
        .and_then(|k| k.as_str().map(str::to_owned).or_else(|| Some(k.to_string())))
        .unwrap_or_default();
      let key = if is_doc_id_field {
        physical_to_logical.get(&raw_key).cloned().unwrap_or(raw_key)
      } else {
        raw_key
      };
      let count = bucket.get("count").and_then(JsonValue::as_i64).unwrap_or(0) as i32;
      let nodes = format_nodes(
        bucket.pointer("/hits/nodes").and_then(JsonValue::as_array),
        &physical_to_logical,
      );
      buckets.push(AggregateBucketObjectType {
        key,
        count,
        hits: AggregateBucketHitsObjectType { nodes },
      });
    }
  }
  let count = i32::try_from(buckets.len()).unwrap_or(i32::MAX);
  let has_more = raw.get("hasMore").and_then(JsonValue::as_bool).unwrap_or(false);
  Ok(AggregateResultObjectType {
    buckets,
    pagination: SearchResultPagination {
      count,
      has_more,
      next_cursor: None,
    },
  })
}

// compat(parity): search-highlight-raw-tags -- emits unescaped v0.27.5 highlight tags while client mention menu HTML escaping remains unfixed
pub(crate) async fn resolve_workspace_search_docs(
  ctx: &Context<'_>,
  workspace_id: &str,
  input: SearchDocsInput,
) -> Result<Vec<SearchDocObjectType>> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  if let Some(limit) = input.limit
    && limit <= 0
  {
    return Err(search_error_to_graphql(
      &SearchError::invalid_input("searchDocs limit must be positive"),
      workspace_id,
    ));
  }
  let limit = input.limit.unwrap_or(20) as u32;
  let agg_request = build_search_docs_aggregate(workspace_id, &input.keyword, limit);
  let agg_raw = match state
    .search
    .aggregate_authorized(&user.id, workspace_id, agg_request)
    .await
  {
    Ok(raw) => raw,
    Err(SearchError::UnsupportedQuery) => {
      let basic = build_basic_search_docs_request(workspace_id, &input.keyword, limit);
      let search_raw = state
        .search
        .search_authorized(&user.id, workspace_id, basic)
        .await
        .map_err(|e| search_error_to_graphql(&e, workspace_id))?;
      let mut seen = HashSet::new();
      let mut buckets = Vec::new();
      for node in search_raw
        .get("nodes")
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
      {
        let doc_id = node
          .pointer("/fields/doc_id/0")
          .and_then(JsonValue::as_str)
          .or_else(|| node.pointer("/_source/doc_id").and_then(JsonValue::as_str))
          .unwrap_or_default()
          .to_owned();
        if doc_id.is_empty() || !seen.insert(doc_id.clone()) {
          continue;
        }
        buckets.push(json!({"key": doc_id, "count": 1, "hits": {"nodes": [node]}}));
        if buckets.len() == limit as usize {
          break;
        }
      }
      json!({"total": buckets.len(), "hasMore": false, "buckets": buckets})
    }
    Err(err) => return Err(search_error_to_graphql(&err, workspace_id)),
  };

  let mut docs = Vec::new();
  let mut user_ids = HashSet::new();
  for bucket in agg_raw
    .get("buckets")
    .and_then(JsonValue::as_array)
    .into_iter()
    .flatten()
  {
    let Some(node) = bucket.pointer("/hits/nodes/0").and_then(JsonValue::as_object) else {
      continue;
    };
    let doc_id = bucket
      .get("key")
      .and_then(JsonValue::as_str)
      .unwrap_or_default()
      .to_owned();
    let fields = node.get("fields").and_then(JsonValue::as_object);
    let block_id = first_str(fields, "source_block_id")
      .filter(|s| !s.is_empty())
      .or_else(|| first_str(fields, "block_id"))
      .unwrap_or_default();
    let flavour = first_str(fields, "flavour").unwrap_or_default();
    let content = first_str(fields, "content").unwrap_or_default();
    let title = if flavour == "affine:page" {
      content.clone()
    } else {
      String::new()
    };
    let highlight = node
      .get("highlights")
      .and_then(|h| h.pointer("/content/0"))
      .and_then(JsonValue::as_str)
      .map(str::to_owned)
      .unwrap_or_else(|| content.clone());
    let created_at = first_datetime(fields, "created_at").unwrap_or_else(Utc::now);
    let updated_at = first_datetime(fields, "updated_at").unwrap_or_else(Utc::now);
    let created_by_user_id = first_str(fields, "created_by_user_id").unwrap_or_default();
    let updated_by_user_id = first_str(fields, "updated_by_user_id").unwrap_or_default();
    if !created_by_user_id.is_empty() {
      user_ids.insert(created_by_user_id.clone());
    }
    if !updated_by_user_id.is_empty() {
      user_ids.insert(updated_by_user_id.clone());
    }
    docs.push((
      SearchDocObjectType {
        doc_id,
        title,
        block_id,
        highlight,
        created_at,
        updated_at,
        created_by_user: None,
        updated_by_user: None,
      },
      created_by_user_id,
      updated_by_user_id,
    ));
  }

  let mut missing_title_doc_ids: Vec<String> = Vec::new();
  let mut missing_title_seen = HashSet::new();
  for (doc, _, _) in &docs {
    if doc.title.is_empty() && !doc.doc_id.is_empty() && missing_title_seen.insert(doc.doc_id.clone()) {
      missing_title_doc_ids.push(doc.doc_id.clone());
    }
  }
  let mut page_titles: HashMap<String, String> = HashMap::new();
  if !missing_title_doc_ids.is_empty()
    && let Ok(mut conn) = state.db.acquire_tiered(server_db::WorkloadTier::InteractiveRead).await
    && let Ok(rows) = sqlx::query(
      "SELECT page_id, title FROM workspace_pages WHERE workspace_id = $1 AND page_id = ANY($2) AND title IS NOT NULL AND lifecycle_state IS DISTINCT FROM 'deleted'",
    )
    .bind(workspace_id)
    .bind(&missing_title_doc_ids)
    .fetch_all(&mut *conn)
    .await
  {
    use sqlx::Row as _;
    for row in rows {
      let page_id: String = row.get("page_id");
      if let Some(title) = row.get::<Option<String>, _>("title") {
        page_titles.insert(page_id, title);
      }
    }
  }

  let mut physical_to_logical: HashMap<String, String> = HashMap::new();
  if let Ok(aliases) = state.doc_sharing.get_doc_id_aliases(workspace_id).await {
    for (logical, physical) in aliases {
      physical_to_logical.entry(physical).or_insert(logical);
    }
  }

  let mut users_map: HashMap<String, PublicUserType> = HashMap::new();
  let user_id_vec: Vec<String> = user_ids.into_iter().collect();
  if !user_id_vec.is_empty()
    && let Ok(mut conn) = state.db.acquire_tiered(server_db::WorkloadTier::InteractiveRead).await
    && let Ok(rows) = sqlx::query("SELECT id, name, avatar_url FROM users WHERE id = ANY($1)")
      .bind(&user_id_vec)
      .fetch_all(&mut *conn)
      .await
  {
    use sqlx::Row as _;
    for row in rows {
      let id: String = row.get("id");
      users_map.insert(
        id.clone(),
        PublicUserType {
          id,
          name: row.get("name"),
          avatar_url: row.get("avatar_url"),
        },
      );
    }
  }

  let result = docs
    .into_iter()
    .map(|(mut doc, created_by, updated_by)| {
      if doc.title.is_empty()
        && let Some(title) = page_titles.get(&doc.doc_id)
      {
        doc.title = title.clone();
      }
      if let Some(logical) = physical_to_logical.get(&doc.doc_id) {
        doc.doc_id = logical.clone();
      }
      doc.created_by_user = users_map.get(&created_by).cloned();
      doc.updated_by_user = users_map.get(&updated_by).cloned();
      doc
    })
    .collect();
  Ok(result)
}

fn build_search_docs_aggregate(workspace_id: &str, keyword: &str, limit: u32) -> DomainAggregateRequest {
  DomainAggregateRequest {
    table: DomainSearchTable::Block,
    field: "docId".to_owned(),
    query: DomainSearchQuery {
      query_type: "boolean".to_owned(),
      occur: Some("must".to_owned()),
      field: None,
      match_value: None,
      query: None,
      boost: None,
      queries: Some(vec![
        DomainSearchQuery {
          query_type: "match".to_owned(),
          field: Some("workspaceId".to_owned()),
          match_value: Some(workspace_id.to_owned()),
          query: None,
          queries: None,
          occur: None,
          boost: None,
        },
        DomainSearchQuery {
          query_type: "boolean".to_owned(),
          occur: Some("must".to_owned()),
          field: None,
          match_value: None,
          query: None,
          boost: None,
          queries: Some(vec![
            DomainSearchQuery {
              query_type: "match".to_owned(),
              field: Some("content".to_owned()),
              match_value: Some(keyword.to_owned()),
              query: None,
              queries: None,
              occur: None,
              boost: None,
            },
            DomainSearchQuery {
              query_type: "boolean".to_owned(),
              occur: Some("should".to_owned()),
              field: None,
              match_value: None,
              query: None,
              boost: None,
              queries: Some(vec![
                DomainSearchQuery {
                  query_type: "match".to_owned(),
                  field: Some("content".to_owned()),
                  match_value: Some(keyword.to_owned()),
                  query: None,
                  queries: None,
                  occur: None,
                  boost: None,
                },
                DomainSearchQuery {
                  query_type: "boost".to_owned(),
                  field: None,
                  match_value: None,
                  queries: None,
                  occur: None,
                  boost: Some(1.5),
                  query: Some(Box::new(DomainSearchQuery {
                    query_type: "match".to_owned(),
                    field: Some("flavour".to_owned()),
                    match_value: Some("affine:page".to_owned()),
                    query: None,
                    queries: None,
                    occur: None,
                    boost: None,
                  })),
                },
              ]),
            },
          ]),
        },
      ]),
    },
    options: DomainAggregateOptions {
      hits: DomainAggregateHitsOptions {
        fields: vec![
          "blockId".to_owned(),
          "unitId".to_owned(),
          "projectionVersion".to_owned(),
          "sourceHash".to_owned(),
          "visibility".to_owned(),
          "elementId".to_owned(),
          "frameId".to_owned(),
          "sourceBlockId".to_owned(),
          "flavour".to_owned(),
          "content".to_owned(),
          "createdAt".to_owned(),
          "updatedAt".to_owned(),
          "createdByUserId".to_owned(),
          "updatedByUserId".to_owned(),
        ],
        highlights: vec![DomainSearchHighlight {
          field: "content".to_owned(),
          before: "<b>".to_owned(),
          end: "</b>".to_owned(),
        }],
        pagination: DomainSearchPagination {
          limit: Some(2),
          skip: None,
          cursor: None,
        },
      },
      pagination: DomainSearchPagination {
        limit: Some(limit),
        skip: None,
        cursor: None,
      },
    },
  }
}

fn build_basic_search_docs_request(workspace_id: &str, keyword: &str, limit: u32) -> DomainSearchRequest {
  let agg = build_search_docs_aggregate(workspace_id, keyword, limit);
  let mut fields = vec!["docId".to_owned()];
  fields.extend(agg.options.hits.fields);
  DomainSearchRequest {
    table: DomainSearchTable::Block,
    query: DomainSearchQuery {
      query_type: "boolean".to_owned(),
      occur: Some("must".to_owned()),
      field: None,
      match_value: None,
      query: None,
      boost: None,
      queries: Some(vec![
        DomainSearchQuery {
          query_type: "match".to_owned(),
          field: Some("workspaceId".to_owned()),
          match_value: Some(workspace_id.to_owned()),
          query: None,
          queries: None,
          occur: None,
          boost: None,
        },
        DomainSearchQuery {
          query_type: "match".to_owned(),
          field: Some("content".to_owned()),
          match_value: Some(keyword.to_owned()),
          query: None,
          queries: None,
          occur: None,
          boost: None,
        },
      ]),
    },
    options: DomainSearchOptions {
      fields,
      highlights: agg.options.hits.highlights,
      pagination: DomainSearchPagination {
        limit: Some(limit.max(1).saturating_mul(4).min(10_000)),
        skip: None,
        cursor: None,
      },
    },
  }
}

fn remap_doc_id_value(val: &mut JsonValue, physical_to_logical: &HashMap<String, String>) {
  match val {
    JsonValue::String(s) => {
      if let Some(logical) = physical_to_logical.get(s.as_str()) {
        *s = logical.clone();
      }
    }
    JsonValue::Array(arr) => {
      for item in arr {
        if let JsonValue::String(s) = item
          && let Some(logical) = physical_to_logical.get(s.as_str())
        {
          *s = logical.clone();
        }
      }
    }
    _ => {}
  }
}

fn format_nodes(
  nodes: Option<&Vec<JsonValue>>,
  physical_to_logical: &HashMap<String, String>,
) -> Vec<SearchNodeObjectType> {
  nodes
    .into_iter()
    .flatten()
    .map(|node| {
      let mut fields = camel_case_object(node.get("fields").and_then(JsonValue::as_object));
      if !physical_to_logical.is_empty() {
        if let Some(val) = fields.get_mut("docId") {
          remap_doc_id_value(val, physical_to_logical);
        }
        if let Some(JsonValue::Object(src)) = fields.get_mut("_source") {
          if let Some(val) = src.get_mut("docId") {
            remap_doc_id_value(val, physical_to_logical);
          }
          if let Some(val) = src.get_mut("doc_id") {
            remap_doc_id_value(val, physical_to_logical);
          }
        }
      }
      let highlights = node
        .get("highlights")
        .and_then(JsonValue::as_object)
        .filter(|h| !h.is_empty())
        .map(|h| JsonObjectScalar(JsonValue::Object(camel_case_object(Some(h)))));
      SearchNodeObjectType {
        fields: JsonObjectScalar(JsonValue::Object(fields)),
        highlights,
      }
    })
    .collect()
}

fn camel_case_object(map: Option<&Map<String, JsonValue>>) -> Map<String, JsonValue> {
  let mut out = Map::new();
  for (key, value) in map.into_iter().flatten() {
    let camel = snake_to_camel(key);
    let formatted = if (key == "created_at" || key == "updated_at")
      && let Some(arr) = value.as_array()
    {
      JsonValue::Array(
        arr
          .iter()
          .map(|v| {
            v.as_i64()
              .and_then(DateTime::from_timestamp_millis)
              .map(|dt| JsonValue::String(dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)))
              .unwrap_or_else(|| v.clone())
          })
          .collect(),
      )
    } else {
      value.clone()
    };
    out.insert(camel, formatted);
  }
  out
}

fn snake_to_camel(s: &str) -> String {
  let mut out = String::with_capacity(s.len());
  let mut upper = false;
  for ch in s.chars() {
    if ch == '_' {
      upper = true;
    } else if upper {
      out.push(ch.to_ascii_uppercase());
      upper = false;
    } else {
      out.push(ch);
    }
  }
  out
}

fn first_str(fields: Option<&Map<String, JsonValue>>, key: &str) -> Option<String> {
  fields?.get(key)?.as_array()?.first()?.as_str().map(str::to_owned)
}

fn first_datetime(fields: Option<&Map<String, JsonValue>>, key: &str) -> Option<DateTime<Utc>> {
  let val = fields?.get(key)?.as_array()?.first()?;
  if let Some(ms) = val.as_i64() {
    return DateTime::from_timestamp_millis(ms);
  }
  val
    .as_str()
    .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
    .map(|dt| dt.with_timezone(&Utc))
}
