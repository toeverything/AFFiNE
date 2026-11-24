use std::time::Duration;

use reqwest::{Client, redirect::Policy};
use serde_json::{Value, json};

use super::{SearchChange, mapping, provider_write_error};
use crate::config::SearchConfig;
use crate::error::{SearchError, SearchResult};
use crate::types::SearchTable;

const MAX_RESPONSE_BYTES: usize = 50 * 1024 * 1024;

pub struct ElasticsearchProvider {
  client: Client,
  endpoint: String,
  api_key: String,
  username: String,
  password: String,
}

impl ElasticsearchProvider {
  pub(super) fn new(config: &SearchConfig) -> SearchResult<Self> {
    let endpoint = config.endpoint.trim_end_matches('/');
    let url = url::Url::parse(endpoint).map_err(|_| SearchError::config("invalid search provider endpoint"))?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
      return Err(SearchError::config("invalid search provider endpoint"));
    }
    let client = Client::builder()
      .redirect(Policy::none())
      .timeout(Duration::from_secs(30))
      .build()
      .map_err(|error| SearchError::invalid_state(format!("search HTTP client failed: {error}")))?;
    Ok(Self {
      client,
      endpoint: endpoint.to_owned(),
      api_key: config.api_key.clone(),
      username: config.username.clone(),
      password: config.password.clone(),
    })
  }

  pub(super) async fn search(&self, physical_table: &str, mut dsl: Value) -> SearchResult<Value> {
    ensure_projection_source(&mut dsl);
    dsl["track_total_hits"] = json!(true);
    let cursor = dsl.as_object_mut().and_then(|object| object.remove("cursor"));
    if let Some(cursor) = cursor {
      let cursor = cursor
        .as_str()
        .ok_or_else(|| SearchError::invalid_input("invalid search cursor"))?;
      dsl["search_after"] =
        serde_json::from_str(cursor).map_err(|error| SearchError::json("invalid search cursor", error))?;
    }
    let body = serde_json::to_vec(&dsl).map_err(|error| SearchError::json("encode search DSL", error))?;
    let response = self
      .request(reqwest::Method::POST, &format!("{physical_table}/_search"))
      .header("content-type", "application/json")
      .body(body)
      .send()
      .await
      .map_err(|_| SearchError::ProviderUnavailable)?;
    let status = response.status();
    let bytes = read_response(response).await?;
    if !status.is_success() {
      return Err(if status.as_u16() == 400 {
        SearchError::UnsupportedQuery
      } else {
        SearchError::ProviderUnavailable
      });
    }
    let value: Value =
      serde_json::from_slice(&bytes).map_err(|error| SearchError::json("invalid search provider response", error))?;
    normalize(value)
  }

  pub(super) async fn aggregate(&self, physical_table: &str, mut dsl: Value) -> SearchResult<Value> {
    if let Some(top_hits) = dsl.pointer_mut("/aggs/result/aggs/result/top_hits") {
      ensure_projection_source(top_hits);
    }
    let limit = dsl
      .pointer("/aggs/result/terms/size")
      .and_then(Value::as_u64)
      .unwrap_or(10);
    let skip = dsl.get("from").and_then(Value::as_u64).unwrap_or_default();
    if let Some(size) = dsl.pointer_mut("/aggs/result/terms/size") {
      *size = json!(skip.saturating_add(limit).saturating_add(1));
    }
    dsl["track_total_hits"] = json!(true);
    let body = serde_json::to_vec(&dsl).map_err(|error| SearchError::json("encode aggregate DSL", error))?;
    let response = self
      .request(reqwest::Method::POST, &format!("{physical_table}/_search"))
      .header("content-type", "application/json")
      .body(body)
      .send()
      .await
      .map_err(|_| SearchError::ProviderUnavailable)?;
    let status = response.status();
    let bytes = read_response(response).await?;
    if !status.is_success() {
      return Err(if status.as_u16() == 400 {
        SearchError::UnsupportedQuery
      } else {
        SearchError::ProviderUnavailable
      });
    }
    let value: Value =
      serde_json::from_slice(&bytes).map_err(|error| SearchError::json("invalid search provider response", error))?;
    normalize_aggregate(value, skip as usize, limit as usize)
  }

  pub(super) async fn provision(&self, physical_table: &str, table: SearchTable) -> SearchResult<()> {
    let response = self
      .request(reqwest::Method::HEAD, physical_table)
      .send()
      .await
      .map_err(|_| SearchError::ProviderUnavailable)?;
    if response.status().is_success() {
      return Ok(());
    }
    if response.status().as_u16() != 404 {
      return Err(provision_error(response.status().as_u16(), &[]));
    }
    let mapping_bytes =
      serde_json::to_vec(&mapping(table)).map_err(|error| SearchError::json("encode search mapping", error))?;
    let response = self
      .request(reqwest::Method::PUT, physical_table)
      .header("content-type", "application/json")
      .body(mapping_bytes)
      .send()
      .await
      .map_err(|_| SearchError::ProviderUnavailable)?;
    if response.status().is_success() {
      return Ok(());
    }
    let status = response.status();
    if status.as_u16() == 400
      && self
        .request(reqwest::Method::HEAD, physical_table)
        .send()
        .await
        .is_ok_and(|response| response.status().is_success())
    {
      return Ok(());
    }
    let body = read_response(response).await?;
    Err(provision_error(status.as_u16(), &body))
  }

  pub(super) async fn drop_generation_asset(&self, physical_table: &str) -> SearchResult<()> {
    let response = self
      .request(reqwest::Method::DELETE, physical_table)
      .send()
      .await
      .map_err(|_| SearchError::ProviderUnavailable)?;
    let status = response.status();
    if status.is_success() || status.as_u16() == 404 {
      Ok(())
    } else {
      Err(provider_write_error(status.as_u16()))
    }
  }

  pub(super) async fn apply(&self, physical_table: &str, changes: &[SearchChange]) -> SearchResult<()> {
    if changes.is_empty() {
      return Ok(());
    }
    let mut body = String::new();
    for change in changes {
      let payload = change.upsert_payload()?;
      body.push_str(
        &serde_json::to_string(&json!({
          "index": {
            "_index": physical_table,
            "_id": change.external_id
          }
        }))
        .map_err(|error| SearchError::json("encode immutable provider upsert", error))?,
      );
      body.push('\n');
      body.push_str(
        &serde_json::to_string(payload)
          .map_err(|error| SearchError::json("encode immutable provider document", error))?,
      );
      body.push('\n');
    }
    let response = self
      .request(reqwest::Method::POST, "_bulk?refresh=wait_for")
      .header("content-type", "application/x-ndjson")
      .body(body)
      .send()
      .await
      .map_err(|_| SearchError::ProviderUnavailable)?;
    let status = response.status();
    let bytes = read_response(response).await?;
    if !status.is_success() {
      return Err(provider_write_error(status.as_u16()));
    }
    let value: Value = serde_json::from_slice(&bytes)
      .map_err(|error| SearchError::invalid_state(format!("invalid provider bulk response: {error}")))?;
    validate_bulk_response(&value, changes.len())
  }

  pub(super) async fn gc_document_history(
    &self,
    physical_table: &str,
    workspace_id: &str,
    doc_id: &str,
    source_version: i64,
    permission_version: i64,
    limit: usize,
  ) -> SearchResult<()> {
    let payload = json!({
      "query": {"bool": {"must": [
        {"term": {"workspace_id": {"value": workspace_id}}},
        {"term": {"doc_id": {"value": doc_id}}}
      ], "must_not": [{"bool": {"must": [
        {"term": {"source_version": {"value": source_version}}},
        {"term": {"permission_version": {"value": permission_version}}}
      ]}}]}},
      "max_docs": limit.max(1)
    });
    let body = serde_json::to_vec(&payload).map_err(|error| SearchError::json("encode history GC query", error))?;
    let response = self
      .request(
        reqwest::Method::POST,
        &format!("{physical_table}/_delete_by_query?conflicts=proceed&refresh=true"),
      )
      .header("content-type", "application/json")
      .body(body)
      .send()
      .await
      .map_err(|_| SearchError::ProviderUnavailable)?;
    let status = response.status();
    let bytes = read_response(response).await?;
    if !status.is_success() {
      return Err(SearchError::ProviderUnavailable);
    }
    let value: Value = serde_json::from_slice(&bytes)
      .map_err(|error| SearchError::json("invalid provider history GC response", error))?;
    validate_delete_response(&value)
  }

  pub(super) async fn gc_workspace(
    &self,
    physical_table: &str,
    workspace_id: &str,
    source_version_high_water: i64,
    limit: usize,
  ) -> SearchResult<bool> {
    let limit = limit.max(1);
    let payload = json!({
      "query": {"bool": {"must": [
        {"term": {"workspace_id": {"value": workspace_id}}},
        {"range": {"source_version": {"lte": source_version_high_water}}}
      ]}},
      "max_docs": limit
    });
    let body = serde_json::to_vec(&payload).map_err(|error| SearchError::json("encode workspace GC query", error))?;
    let response = self
      .request(
        reqwest::Method::POST,
        &format!("{physical_table}/_delete_by_query?conflicts=proceed&refresh=true"),
      )
      .header("content-type", "application/json")
      .body(body)
      .send()
      .await
      .map_err(|_| SearchError::ProviderUnavailable)?;
    let status = response.status();
    let bytes = read_response(response).await?;
    if !status.is_success() {
      return Err(SearchError::ProviderUnavailable);
    }
    let value: Value = serde_json::from_slice(&bytes)
      .map_err(|error| SearchError::json("invalid provider workspace GC response", error))?;
    validate_delete_response(&value)?;
    let deleted = value
      .get("deleted")
      .and_then(Value::as_u64)
      .ok_or_else(|| SearchError::invalid_state("invalid provider workspace GC response"))?;
    Ok(deleted >= limit as u64)
  }

  fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
    let mut request = self.client.request(method, format!("{}/{path}", self.endpoint));
    if !self.api_key.is_empty() {
      request = request.header("Authorization", format!("ApiKey {}", self.api_key));
    } else if !self.username.is_empty() {
      request = request.basic_auth(&self.username, Some(&self.password));
    }
    request
  }
}

fn provision_error(status: u16, body: &[u8]) -> SearchError {
  if matches!(status, 401 | 403) {
    return SearchError::config("search provider authentication failed");
  }
  if status == 400 {
    let error_type = serde_json::from_slice::<Value>(body)
      .ok()
      .and_then(|value| value.pointer("/error/type").and_then(Value::as_str).map(str::to_owned));
    return if matches!(
      error_type.as_deref(),
      Some("mapper_parsing_exception" | "strict_dynamic_mapping_exception" | "illegal_argument_exception")
    ) {
      SearchError::GenerationInvalid("provider schema rejected generation".to_owned())
    } else {
      SearchError::ProviderUnavailable
    };
  }
  provider_write_error(status)
}

fn validate_delete_response(value: &Value) -> SearchResult<()> {
  if value.get("timed_out").and_then(Value::as_bool) == Some(true)
    || value
      .get("failures")
      .and_then(Value::as_array)
      .is_some_and(|failures| !failures.is_empty())
  {
    return Err(SearchError::invalid_state("provider_apply_failed"));
  }
  Ok(())
}

fn validate_bulk_response(value: &Value, expected_items: usize) -> SearchResult<()> {
  let items = value
    .get("items")
    .and_then(Value::as_array)
    .ok_or_else(|| SearchError::invalid_state("invalid provider bulk response"))?;
  if items.len() != expected_items {
    return Err(SearchError::invalid_state("provider_apply_failed"));
  }
  for item in items {
    let result = item
      .as_object()
      .and_then(|item| item.values().next())
      .and_then(Value::as_object)
      .ok_or_else(|| SearchError::invalid_state("provider_apply_failed"))?;
    let status = result
      .get("status")
      .and_then(Value::as_u64)
      .and_then(|status| u16::try_from(status).ok())
      .ok_or_else(|| SearchError::invalid_state("provider_apply_failed"))?;
    if result.get("error").is_some() || !(200..300).contains(&status) {
      return Err(provider_write_error(status));
    }
  }
  if value.get("errors").and_then(Value::as_bool) != Some(false) {
    return Err(SearchError::invalid_state("provider_apply_failed"));
  }
  Ok(())
}

fn ensure_projection_source(dsl: &mut Value) {
  let mut source = dsl
    .get("_source")
    .and_then(Value::as_array)
    .cloned()
    .unwrap_or_default();
  for field in ["doc_id", "source_version", "permission_version"] {
    if !source.iter().any(|value| value.as_str() == Some(field)) {
      source.push(json!(field));
    }
  }
  dsl["_source"] = json!(source);
}

async fn read_response(mut response: reqwest::Response) -> SearchResult<Vec<u8>> {
  if response
    .content_length()
    .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
  {
    return Err(SearchError::invalid_state("provider_response_too_large"));
  }
  let mut bytes = Vec::new();
  while let Some(chunk) = response.chunk().await.map_err(|_| SearchError::ProviderUnavailable)? {
    if bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
      return Err(SearchError::invalid_state("provider_response_too_large"));
    }
    bytes.extend_from_slice(&chunk);
  }
  Ok(bytes)
}

fn normalize(value: Value) -> SearchResult<Value> {
  let hits = value
    .pointer("/hits/hits")
    .and_then(Value::as_array)
    .ok_or_else(|| SearchError::invalid_state("invalid provider response"))?;
  let total = value
    .pointer("/hits/total/value")
    .or_else(|| value.pointer("/hits/total"))
    .and_then(Value::as_u64)
    .ok_or_else(|| SearchError::invalid_state("inexact provider total"))?;
  let nodes = hits.iter().map(normalize_hit).collect::<Vec<_>>();
  let next_cursor = hits
    .last()
    .and_then(|hit| hit.get("sort"))
    .map(serde_json::to_string)
    .transpose()
    .map_err(|error| SearchError::json("encode provider cursor", error))?;
  Ok(json!({"total": total, "nodes": nodes, "nextCursor": next_cursor}))
}

fn normalize_aggregate(value: Value, skip: usize, limit: usize) -> SearchResult<Value> {
  let buckets = value
    .pointer("/aggregations/result/buckets")
    .and_then(Value::as_array)
    .ok_or_else(|| SearchError::invalid_state("invalid provider aggregate response"))?;
  let nodes = buckets
    .iter()
    .map(|bucket| {
      let hits = bucket
        .pointer("/result/hits/hits")
        .and_then(Value::as_array)
        .ok_or_else(|| SearchError::invalid_state("invalid provider aggregate hits"))?;
      Ok(json!({
        "key": bucket.get("key").cloned().unwrap_or(Value::Null),
        "count": bucket.get("doc_count").cloned().unwrap_or(json!(0)),
        "hits": hits.iter().map(normalize_hit).collect::<Vec<_>>()
      }))
    })
    .collect::<SearchResult<Vec<_>>>()?;
  let total = nodes.len();
  let has_more = total > skip.saturating_add(limit);
  let nodes = nodes.into_iter().skip(skip).take(limit).collect::<Vec<_>>();
  Ok(json!({"total": total, "hasMore": has_more, "buckets": nodes}))
}

fn normalize_hit(hit: &Value) -> Value {
  json!({
    "id": hit.get("_id").and_then(Value::as_str).unwrap_or_default(),
    "score": hit.get("_score").and_then(Value::as_f64).unwrap_or_default(),
    "fields": hit.get("fields").cloned().unwrap_or_else(|| json!({})),
    "highlights": hit.get("highlight").cloned().unwrap_or_else(|| json!({})),
    "_source": hit.get("_source").cloned().unwrap_or_else(|| json!({})),
  })
}
