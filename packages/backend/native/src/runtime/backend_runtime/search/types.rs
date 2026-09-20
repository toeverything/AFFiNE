use serde::{Deserialize, Serialize};

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
