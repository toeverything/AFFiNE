use std::collections::HashMap;

use memory_indexer::{AggregationResult, SearchHit, SearchResult, SortValue, Value};
use serde::Serialize;

use super::schema::TableSchema;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct NativeSearchResult {
  pub total: usize,
  pub nodes: Vec<NativeHit>,
  pub next_cursor: Option<String>,
}

#[derive(Serialize)]
pub(super) struct NativeAggregateResult {
  pub total: usize,
  #[serde(rename = "hasMore")]
  pub has_more: bool,
  pub buckets: Vec<NativeBucket>,
}

#[derive(Serialize)]
pub(super) struct NativeBucket {
  pub key: serde_json::Value,
  pub count: u64,
  pub hits: Vec<NativeHit>,
}

#[derive(Serialize)]
pub(super) struct NativeHit {
  pub id: String,
  pub score: f32,
  pub fields: serde_json::Map<String, serde_json::Value>,
  pub highlights: serde_json::Map<String, serde_json::Value>,
}

pub(super) type HighlightTags = HashMap<String, (String, String)>;

pub(super) fn search_result(
  table: &TableSchema,
  result: SearchResult,
  highlight_tags: &HighlightTags,
) -> NativeSearchResult {
  let next_cursor = result.hits.last().map(|hit| cursor(&hit.sort_values));
  NativeSearchResult {
    total: result.total,
    nodes: result
      .hits
      .into_iter()
      .map(|hit| native_hit(table, hit, highlight_tags))
      .collect(),
    next_cursor,
  }
}

pub(super) fn aggregate_result(
  table: &TableSchema,
  mut result: AggregationResult,
  limit: usize,
  highlight_tags: &HighlightTags,
) -> NativeAggregateResult {
  let total = result.buckets.len();
  let has_more = result.buckets.len() > limit;
  result.buckets.truncate(limit);
  NativeAggregateResult {
    total,
    has_more,
    buckets: result
      .buckets
      .into_iter()
      .map(|bucket| NativeBucket {
        key: json_value(bucket.key),
        count: bucket.count,
        hits: bucket
          .hits
          .into_iter()
          .map(|hit| native_hit(table, hit, highlight_tags))
          .collect(),
      })
      .collect(),
  }
}

fn native_hit(table: &TableSchema, hit: SearchHit, highlight_tags: &HighlightTags) -> NativeHit {
  let mut fields = serde_json::Map::new();
  for (field, values) in hit.fields {
    let name = table.field_name(field).to_string();
    let values = values.into_iter().map(json_value).collect::<Vec<_>>();
    fields.insert(name, serde_json::Value::Array(values));
  }
  let mut highlights: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
  for highlight in hit.highlights {
    let name = table.field_name(highlight.field).to_string();
    let Some((before, after)) = highlight_tags.get(&name) else {
      continue;
    };
    let Some(text) = fields
      .get(&name)
      .and_then(serde_json::Value::as_array)
      .and_then(|values| values.get(highlight.value_index as usize))
      .and_then(serde_json::Value::as_str)
    else {
      continue;
    };
    let value = render_highlight(text, &highlight.spans, before, after);
    highlights
      .entry(name)
      .or_insert_with(|| serde_json::Value::Array(Vec::new()))
      .as_array_mut()
      .expect("highlight value is an array")
      .push(serde_json::Value::String(value));
  }
  NativeHit {
    id: hit.id,
    score: hit.score,
    fields,
    highlights,
  }
}

fn render_highlight(text: &str, spans: &[(u32, u32)], before: &str, after: &str) -> String {
  let mut output = String::new();
  let mut cursor = 0;
  for &(start, end) in spans {
    let start = utf16_to_byte(text, start as usize);
    let end = utf16_to_byte(text, end as usize);
    if start < cursor || end < start || end > text.len() {
      continue;
    }
    output.push_str(&text[cursor..start]);
    output.push_str(before);
    output.push_str(&text[start..end]);
    output.push_str(after);
    cursor = end;
  }
  output.push_str(&text[cursor..]);
  output
}

fn utf16_to_byte(text: &str, offset: usize) -> usize {
  let mut units = 0;
  for (byte, character) in text.char_indices() {
    if units >= offset {
      return byte;
    }
    units += character.len_utf16();
  }
  text.len()
}

fn cursor(values: &[SortValue]) -> String {
  serde_json::to_string(&values.iter().map(sort_value).collect::<Vec<_>>()).expect("cursor values serialize")
}

fn sort_value(value: &SortValue) -> serde_json::Value {
  match value {
    SortValue::Score(value) => serde_json::json!(value),
    SortValue::String(value) => serde_json::json!(value),
    SortValue::I64(value) => serde_json::json!(value),
    SortValue::Bool(value) => serde_json::json!(value),
    SortValue::Missing => serde_json::Value::Null,
  }
}

fn json_value(value: Value) -> serde_json::Value {
  match value {
    Value::String(value) => serde_json::Value::String(value),
    Value::I64(value) => serde_json::json!(value),
    Value::Bool(value) => serde_json::json!(value),
  }
}
