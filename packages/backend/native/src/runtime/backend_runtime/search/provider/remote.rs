use std::time::Duration;

use reqwest::{Client, redirect::Policy};
use serde_json::{Value, json};

use super::{SearchChange, SearchTable, provider_write_error, webpki_tls_config};
use crate::runtime::{RuntimeError, RuntimeResult, SearchRuntimeConfig};

const MAX_RESPONSE_BYTES: usize = 50 * 1024 * 1024;

pub(in crate::runtime::backend_runtime::search) struct RemoteProvider {
  client: Client,
  endpoint: String,
  api_key: String,
  username: String,
  password: String,
}

impl RemoteProvider {
  pub(super) fn new(config: &SearchRuntimeConfig) -> RuntimeResult<Self> {
    let endpoint = config.endpoint.trim_end_matches('/');
    let url = url::Url::parse(endpoint).map_err(|_| RuntimeError::config("invalid search provider endpoint"))?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
      return Err(RuntimeError::config("invalid search provider endpoint"));
    }
    let client = Client::builder()
      .tls_backend_preconfigured(
        webpki_tls_config()
          .map_err(|error| RuntimeError::invalid_state(format!("search TLS config failed: {error}")))?,
      )
      .redirect(Policy::none())
      .timeout(Duration::from_secs(30));
    let client = client
      .build()
      .map_err(|error| RuntimeError::invalid_state(format!("search HTTP client failed: {error}")))?;
    Ok(Self {
      client,
      endpoint: endpoint.to_string(),
      api_key: config.api_key.clone(),
      username: config.username.clone(),
      password: config.password.clone(),
    })
  }

  pub(super) async fn search(&self, physical_table: &str, mut dsl: Value) -> RuntimeResult<Value> {
    ensure_projection_source(&mut dsl);
    dsl["track_total_hits"] = json!(true);
    let cursor = dsl.as_object_mut().and_then(|object| object.remove("cursor"));
    if let Some(cursor) = cursor {
      let cursor = cursor
        .as_str()
        .ok_or_else(|| RuntimeError::invalid_input("invalid search cursor"))?;
      dsl["search_after"] =
        serde_json::from_str(cursor).map_err(|error| RuntimeError::json("invalid search cursor", error))?;
    }
    let mut request = self
      .client
      .post(format!("{}/{physical_table}/_search", self.endpoint))
      .json(&dsl);
    if !self.api_key.is_empty() {
      request = request.header("Authorization", format!("ApiKey {}", self.api_key));
    } else if !self.username.is_empty() {
      request = request.basic_auth(&self.username, Some(&self.password));
    }
    let response = request
      .send()
      .await
      .map_err(|_| RuntimeError::SearchProviderUnavailable)?;
    let status = response.status();
    let bytes = read_response(response).await?;
    if !status.is_success() {
      return Err(if status.as_u16() == 400 {
        RuntimeError::SearchUnsupportedQuery
      } else {
        RuntimeError::SearchProviderUnavailable
      });
    }
    let value: Value =
      serde_json::from_slice(&bytes).map_err(|error| RuntimeError::json("invalid search provider response", error))?;
    normalize(value)
  }

  pub(super) async fn aggregate(&self, physical_table: &str, mut dsl: Value) -> RuntimeResult<Value> {
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
    let response = self
      .request(reqwest::Method::POST, &format!("{physical_table}/_search"))
      .json(&dsl)
      .send()
      .await
      .map_err(|_| RuntimeError::SearchProviderUnavailable)?;
    let status = response.status();
    let bytes = read_response(response).await?;
    if !status.is_success() {
      return Err(if status.as_u16() == 400 {
        RuntimeError::SearchUnsupportedQuery
      } else {
        RuntimeError::SearchProviderUnavailable
      });
    }
    let value: Value =
      serde_json::from_slice(&bytes).map_err(|error| RuntimeError::json("invalid search provider response", error))?;
    normalize_aggregate(value, skip as usize, limit as usize)
  }

  pub(super) async fn provision(&self, physical_table: &str, table: SearchTable) -> RuntimeResult<()> {
    let response = self
      .request(reqwest::Method::HEAD, physical_table)
      .send()
      .await
      .map_err(|_| RuntimeError::SearchProviderUnavailable)?;
    if response.status().is_success() {
      return Ok(());
    }
    if response.status().as_u16() != 404 {
      return Err(provision_error(response.status().as_u16(), &[]));
    }
    let response = self
      .request(reqwest::Method::PUT, physical_table)
      .json(&super::mapping(table))
      .send()
      .await
      .map_err(|_| RuntimeError::SearchProviderUnavailable)?;
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

  pub(super) async fn drop_generation_asset(&self, physical_table: &str) -> RuntimeResult<()> {
    let response = self
      .request(reqwest::Method::DELETE, physical_table)
      .send()
      .await
      .map_err(|_| RuntimeError::SearchProviderUnavailable)?;
    let status = response.status();
    if status.is_success() || status.as_u16() == 404 {
      Ok(())
    } else {
      Err(provider_write_error(status.as_u16()))
    }
  }

  pub(super) async fn apply(&self, physical_table: &str, changes: &[SearchChange]) -> RuntimeResult<()> {
    if changes.is_empty() {
      return Ok(());
    }
    self.apply_elasticsearch(physical_table, changes).await
  }

  async fn apply_elasticsearch(&self, physical_table: &str, changes: &[SearchChange]) -> RuntimeResult<()> {
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
        .map_err(|error| RuntimeError::json("encode immutable provider upsert", error))?,
      );
      body.push('\n');
      body.push_str(
        &serde_json::to_string(payload)
          .map_err(|error| RuntimeError::json("encode immutable provider document", error))?,
      );
      body.push('\n');
    }
    if body.is_empty() {
      return Ok(());
    }
    let response = self
      .request(reqwest::Method::POST, "_bulk?refresh=wait_for")
      .header("content-type", "application/x-ndjson")
      .body(body)
      .send()
      .await
      .map_err(|_| RuntimeError::SearchProviderUnavailable)?;
    if !response.status().is_success() {
      return Err(provider_write_error(response.status().as_u16()));
    }
    let value: Value = response
      .json()
      .await
      .map_err(|error| RuntimeError::invalid_state(format!("invalid provider bulk response: {error}")))?;
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
  ) -> RuntimeResult<()> {
    let query = json!({"bool":{"must":[
      {"term":{"workspace_id":{"value":workspace_id}}},
      {"term":{"doc_id":{"value":doc_id}}}
    ],"must_not":[{"bool":{"must":[
      {"term":{"source_version":{"value":source_version}}},
      {"term":{"permission_version":{"value":permission_version}}}
    ]}}]}});
    let response = self
      .request(
        reqwest::Method::POST,
        &format!("{physical_table}/_delete_by_query?conflicts=proceed&refresh=true"),
      )
      .json(&json!({"query":query,"max_docs":limit.max(1)}))
      .send()
      .await
      .map_err(|_| RuntimeError::SearchProviderUnavailable)?;
    let status = response.status();
    let body = read_response(response).await?;
    if !status.is_success() {
      return Err(RuntimeError::SearchProviderUnavailable);
    }
    let value: Value = serde_json::from_slice(&body)
      .map_err(|error| RuntimeError::json("invalid provider history GC response", error))?;
    validate_delete_response(&value)
  }

  pub(super) async fn gc_workspace(
    &self,
    physical_table: &str,
    workspace_id: &str,
    source_version_high_water: i64,
    limit: usize,
  ) -> RuntimeResult<bool> {
    let limit = limit.max(1);
    let response = self
      .request(
        reqwest::Method::POST,
        &format!("{physical_table}/_delete_by_query?conflicts=proceed&refresh=true"),
      )
      .json(&json!({
        "query":{"bool":{"must":[
          {"term":{"workspace_id":{"value":workspace_id}}},
          {"range":{"source_version":{"lte":source_version_high_water}}}
        ]}},
        "max_docs":limit
      }))
      .send()
      .await
      .map_err(|_| RuntimeError::SearchProviderUnavailable)?;
    let status = response.status();
    let body = read_response(response).await?;
    if !status.is_success() {
      return Err(RuntimeError::SearchProviderUnavailable);
    }
    let value: Value = serde_json::from_slice(&body)
      .map_err(|error| RuntimeError::json("invalid provider workspace GC response", error))?;
    validate_delete_response(&value)?;
    let deleted = value
      .get("deleted")
      .and_then(Value::as_u64)
      .ok_or_else(|| RuntimeError::invalid_state("invalid provider workspace GC response"))?;
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

fn provision_error(status: u16, body: &[u8]) -> RuntimeError {
  if matches!(status, 401 | 403) {
    return RuntimeError::config("search provider authentication failed");
  }
  if status == 400 {
    let error_type = serde_json::from_slice::<Value>(body)
      .ok()
      .and_then(|value| value.pointer("/error/type").and_then(Value::as_str).map(str::to_string));
    return if matches!(
      error_type.as_deref(),
      Some("mapper_parsing_exception" | "strict_dynamic_mapping_exception" | "illegal_argument_exception")
    ) {
      RuntimeError::invalid_state("provider_schema_failed")
    } else {
      RuntimeError::SearchProviderUnavailable
    };
  }
  provider_write_error(status)
}

fn validate_delete_response(value: &Value) -> RuntimeResult<()> {
  if value.get("timed_out").and_then(Value::as_bool) == Some(true)
    || value
      .get("failures")
      .and_then(Value::as_array)
      .is_some_and(|failures| !failures.is_empty())
  {
    return Err(RuntimeError::invalid_state("provider_apply_failed"));
  }
  Ok(())
}

fn validate_bulk_response(value: &Value, expected_items: usize) -> RuntimeResult<()> {
  let items = value
    .get("items")
    .and_then(Value::as_array)
    .ok_or_else(|| RuntimeError::invalid_state("invalid provider bulk response"))?;
  if items.len() != expected_items {
    return Err(RuntimeError::invalid_state("provider_apply_failed"));
  }
  for item in items {
    let result = item
      .as_object()
      .and_then(|item| item.values().next())
      .and_then(Value::as_object)
      .ok_or_else(|| RuntimeError::invalid_state("provider_apply_failed"))?;
    let status = result
      .get("status")
      .and_then(Value::as_u64)
      .and_then(|status| u16::try_from(status).ok())
      .ok_or_else(|| RuntimeError::invalid_state("provider_apply_failed"))?;
    if result.get("error").is_some() || !(200..300).contains(&status) {
      return Err(provider_write_error(status));
    }
  }
  if value.get("errors").and_then(Value::as_bool) != Some(false) {
    return Err(RuntimeError::invalid_state("provider_apply_failed"));
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

async fn read_response(mut response: reqwest::Response) -> RuntimeResult<Vec<u8>> {
  if response
    .content_length()
    .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
  {
    return Err(RuntimeError::invalid_state("provider_response_too_large"));
  }
  let mut bytes = Vec::new();
  while let Some(chunk) = response
    .chunk()
    .await
    .map_err(|_| RuntimeError::SearchProviderUnavailable)?
  {
    if bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
      return Err(RuntimeError::invalid_state("provider_response_too_large"));
    }
    bytes.extend_from_slice(&chunk);
  }
  Ok(bytes)
}

fn normalize(value: Value) -> RuntimeResult<Value> {
  let hits = value
    .pointer("/hits/hits")
    .and_then(Value::as_array)
    .ok_or_else(|| RuntimeError::invalid_state("invalid provider response"))?;
  let total = value
    .pointer("/hits/total/value")
    .or_else(|| value.pointer("/hits/total"))
    .and_then(Value::as_u64)
    .ok_or_else(|| RuntimeError::invalid_state("inexact provider total"))?;
  let nodes = hits
    .iter()
    .map(|hit| {
      let fields = hit.get("fields").cloned().unwrap_or_else(|| json!({}));
      json!({
        "id":hit.get("_id").and_then(Value::as_str).unwrap_or_default(),
        "score":hit.get("_score").and_then(Value::as_f64).unwrap_or_default(),
        "fields":fields,
        "highlights":hit.get("highlight").cloned().unwrap_or_else(||json!({})),
        "_source":hit.get("_source").cloned().unwrap_or_else(||json!({})),
      })
    })
    .collect::<Vec<_>>();
  let next_cursor = hits
    .last()
    .and_then(|hit| hit.get("sort"))
    .map(serde_json::to_string)
    .transpose()
    .map_err(|error| RuntimeError::json("encode provider cursor", error))?;
  Ok(json!({"total":total,"nodes":nodes,"nextCursor":next_cursor}))
}

fn normalize_aggregate(value: Value, skip: usize, limit: usize) -> RuntimeResult<Value> {
  let buckets = value
    .pointer("/aggregations/result/buckets")
    .and_then(Value::as_array)
    .ok_or_else(|| RuntimeError::invalid_state("invalid provider aggregate response"))?;
  let nodes = buckets
    .iter()
    .map(|bucket| {
      let hits = bucket
        .pointer("/result/hits/hits")
        .and_then(Value::as_array)
        .ok_or_else(|| RuntimeError::invalid_state("invalid provider aggregate hits"))?;
      Ok(json!({
        "key":bucket.get("key").cloned().unwrap_or(Value::Null),
        "count":bucket.get("doc_count").cloned().unwrap_or(json!(0)),
        "hits":hits.iter().map(normalize_hit).collect::<Vec<_>>()
      }))
    })
    .collect::<RuntimeResult<Vec<_>>>()?;
  let total = nodes.len();
  let has_more = total > skip.saturating_add(limit);
  let nodes = nodes.into_iter().skip(skip).take(limit).collect::<Vec<_>>();
  Ok(json!({"total":total,"hasMore":has_more,"buckets":nodes}))
}

fn normalize_hit(hit: &Value) -> Value {
  json!({
    "id":hit.get("_id").and_then(Value::as_str).unwrap_or_default(),
    "score":hit.get("_score").and_then(Value::as_f64).unwrap_or_default(),
    "fields":hit.get("fields").cloned().unwrap_or_else(||json!({})),
    "highlights":hit.get("highlight").cloned().unwrap_or_else(||json!({})),
    "_source":hit.get("_source").cloned().unwrap_or_else(||json!({})),
  })
}

#[cfg(test)]
mod tests {
  use serde_json::json;

  use super::{normalize_aggregate, provision_error, validate_bulk_response, validate_delete_response};
  use crate::runtime::RuntimeError;

  #[test]
  fn delete_response_rejects_partial_provider_failures() {
    assert!(validate_delete_response(&json!({"failures":[]})).is_ok());
    assert!(validate_delete_response(&json!({"timed_out":true})).is_err());
    assert!(validate_delete_response(&json!({"failures":[{"reason":"stale"}]})).is_err());
  }

  #[test]
  fn bulk_response_requires_every_item_to_succeed() {
    for (response, expected_items, valid) in [
      (
        json!({"errors":false,"items":[{"index":{"status":201}},{"index":{"status":200}}]}),
        2,
        true,
      ),
      (json!({"errors":false,"items":[{"index":{"status":404}}]}), 1, false),
      (
        json!({"errors":true,"items":[{"index":{"status":201}},{"index":{"status":400,"error":{}}}]}),
        2,
        false,
      ),
      (json!({"errors":false}), 1, false),
    ] {
      assert_eq!(validate_bulk_response(&response, expected_items).is_ok(), valid);
    }
    assert!(matches!(
      validate_bulk_response(&json!({"errors":true,"items":[{"index":{"status":400,"error":{}}}]}), 1),
      Err(RuntimeError::SearchSourceInvalid(_))
    ));
    assert!(matches!(
      validate_bulk_response(&json!({"errors":true,"items":[{"index":{"status":429,"error":{}}}]}), 1),
      Err(RuntimeError::SearchProviderUnavailable)
    ));
    assert!(matches!(
      provision_error(400, br#"{"error":{"type":"validation_exception"}}"#),
      RuntimeError::SearchProviderUnavailable
    ));
    assert!(matches!(
      provision_error(400, br#"{"error":{"type":"mapper_parsing_exception"}}"#),
      RuntimeError::InvalidState(_)
    ));
    assert!(matches!(provision_error(401, &[]), RuntimeError::Config(_)));
  }

  #[test]
  fn aggregate_normalization_reports_extra_buckets() {
    let value = json!({
      "aggregations":{"result":{"buckets":[
        {"key":"one","doc_count":2,"result":{"hits":{"hits":[]}}},
        {"key":"two","doc_count":1,"result":{"hits":{"hits":[]}}}
      ]}}
    });
    let result = normalize_aggregate(value, 0, 1).unwrap();
    assert_eq!(result["total"], 2);
    assert_eq!(result["hasMore"], true);
    assert_eq!(result["buckets"].as_array().unwrap().len(), 1);
    assert!(result["buckets"][0]["hits"].is_array());
  }

  #[test]
  fn aggregate_normalization_applies_bucket_skip_before_limit() {
    let value = json!({
      "aggregations":{"result":{"buckets":[
        {"key":"one","doc_count":2,"result":{"hits":{"hits":[]}}},
        {"key":"two","doc_count":1,"result":{"hits":{"hits":[]}}},
        {"key":"three","doc_count":1,"result":{"hits":{"hits":[]}}}
      ]}}
    });
    let result = normalize_aggregate(value, 1, 1).unwrap();
    assert_eq!(result["total"], 3);
    assert_eq!(result["hasMore"], true);
    assert_eq!(result["buckets"][0]["key"], "two");
  }
}
