use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchTable {
  Doc,
  Block,
}

impl SearchTable {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Doc => "doc",
      Self::Block => "block",
    }
  }

  pub fn text_field(self) -> &'static str {
    match self {
      Self::Doc => "title",
      Self::Block => "content",
    }
  }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPagination {
  pub limit: Option<u32>,
  pub skip: Option<u32>,
  pub cursor: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHighlight {
  pub field: String,
  pub before: String,
  pub end: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
  pub fields: Vec<String>,
  #[serde(default)]
  pub highlights: Vec<SearchHighlight>,
  #[serde(default)]
  pub pagination: SearchPagination,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AggregateHitsOptions {
  pub fields: Vec<String>,
  #[serde(default)]
  pub highlights: Vec<SearchHighlight>,
  #[serde(default)]
  pub pagination: SearchPagination,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AggregateOptions {
  pub hits: AggregateHitsOptions,
  #[serde(default)]
  pub pagination: SearchPagination,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
  #[serde(rename = "type")]
  pub query_type: String,
  pub field: Option<String>,
  #[serde(rename = "match")]
  pub match_value: Option<String>,
  pub query: Option<Box<SearchQuery>>,
  pub queries: Option<Vec<SearchQuery>>,
  pub occur: Option<String>,
  pub boost: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
  pub table: SearchTable,
  pub query: SearchQuery,
  pub options: SearchOptions,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AggregateRequest {
  pub table: SearchTable,
  pub query: SearchQuery,
  pub field: String,
  pub options: AggregateOptions,
}
