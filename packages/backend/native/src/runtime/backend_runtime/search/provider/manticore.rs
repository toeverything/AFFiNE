use std::time::Duration;

use reqwest::{Client, redirect::Policy};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};

#[cfg(test)]
use super::manticore_query::{translate_query, translate_sort};
use super::{
  SearchChange, SearchTable, manticore_query::translate_search_request, provider_write_error, webpki_tls_config,
};
use crate::runtime::{RuntimeError, RuntimeResult, SearchRuntimeConfig};

const MAX_RESPONSE_BYTES: usize = 50 * 1024 * 1024;

pub(in crate::runtime::backend_runtime::search) struct ManticoreSearchProvider {
  client: Client,
  endpoint: String,
  api_key: String,
  username: String,
  password: String,
}

impl ManticoreSearchProvider {
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
      .timeout(Duration::from_secs(30))
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

  pub(super) async fn search(&self, physical_table: &str, dsl: Value) -> RuntimeResult<Value> {
    let request = translate_search_request(physical_table, dsl)?;
    let response = self
      .request(reqwest::Method::POST, "search")
      .json(&request)
      .send()
      .await;
    let response = response.map_err(|_| RuntimeError::SearchProviderUnavailable)?;
    let status = response.status();
    let body = read_response(response).await?;
    if !status.is_success() {
      return Err(if status.as_u16() == 400 {
        RuntimeError::SearchUnsupportedQuery
      } else {
        RuntimeError::SearchProviderUnavailable
      });
    }
    let value: Value =
      serde_json::from_slice(&body).map_err(|error| RuntimeError::json("invalid search provider response", error))?;
    normalize(value, request.get("offset").and_then(Value::as_u64).unwrap_or_default())
  }

  pub(super) async fn aggregate(&self, _physical_table: &str, _dsl: Value) -> RuntimeResult<Value> {
    Err(RuntimeError::SearchUnsupportedQuery)
  }

  pub(super) async fn provision(&self, physical_table: &str, table: SearchTable) -> RuntimeResult<()> {
    let response = self
      .request(reqwest::Method::POST, "sql?mode=raw")
      .header("content-type", "application/x-www-form-urlencoded")
      .body(create_table_sql(physical_table, table))
      .send()
      .await
      .map_err(|_| RuntimeError::SearchProviderUnavailable)?;
    let status = response.status();
    let body = read_response(response).await?;
    if !status.is_success() {
      return Err(match status.as_u16() {
        400 => RuntimeError::invalid_state("provider_schema_failed"),
        401 | 403 => RuntimeError::config("search provider authentication failed"),
        status => provider_write_error(status),
      });
    }
    let value: Value = serde_json::from_slice(&body)
      .map_err(|error| RuntimeError::json("invalid search provider schema response", error))?;
    if value.get("error").is_some() {
      return Err(RuntimeError::invalid_state("provider_schema_failed"));
    }
    Ok(())
  }

  pub(super) async fn drop_generation_asset(&self, physical_table: &str) -> RuntimeResult<()> {
    let response = self
      .request(reqwest::Method::POST, "sql?mode=raw")
      .header("content-type", "application/x-www-form-urlencoded")
      .body(format!("DROP TABLE IF EXISTS {physical_table}"))
      .send()
      .await
      .map_err(|_| RuntimeError::SearchProviderUnavailable)?;
    let status = response.status();
    let body = read_response(response).await?;
    if !status.is_success() {
      return Err(provider_write_error(status.as_u16()));
    }
    let value: Value = serde_json::from_slice(&body)
      .map_err(|error| RuntimeError::json("invalid search provider schema response", error))?;
    if value.get("error").is_some() {
      return Err(RuntimeError::invalid_state("provider_schema_failed"));
    }
    Ok(())
  }

  pub(super) async fn apply(&self, physical_table: &str, changes: &[SearchChange]) -> RuntimeResult<()> {
    if changes.is_empty() {
      return Ok(());
    }
    let mut body = String::new();
    for change in changes {
      let payload = change.upsert_payload()?;
      let mut document = manticore_document(payload);
      document.insert("external_id".to_string(), json!(change.external_id));
      body.push_str(
        &serde_json::to_string(&json!({
          "replace": {
            "table": physical_table,
            "id": document_id(&change.external_id),
            "doc": document,
          }
        }))
        .map_err(|error| RuntimeError::json("encode manticore document", error))?,
      );
      body.push('\n');
    }
    if body.is_empty() {
      return Ok(());
    }
    let response = self
      .request(reqwest::Method::POST, "bulk")
      .header("content-type", "application/x-ndjson")
      .body(body)
      .send()
      .await
      .map_err(|_| RuntimeError::SearchProviderUnavailable)?;
    let status = response.status();
    let body = read_response(response).await?;
    if !status.is_success() {
      return Err(provider_write_error(status.as_u16()));
    }
    let value: Value =
      serde_json::from_slice(&body).map_err(|error| RuntimeError::json("invalid manticore bulk response", error))?;
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
    let query = json!({
      "bool": {
        "must": [
          {"equals":{"workspace_id":workspace_id}},
          {"equals":{"doc_id":doc_id}},
        ],
        "must_not": [{"bool":{"must":[
          {"equals":{"source_version":source_version}},
          {"equals":{"permission_version":permission_version}}
        ]}}]
      }
    });
    self
      .delete_bounded(physical_table, query, limit.max(1))
      .await
      .map(|_| ())
  }

  pub(super) async fn gc_workspace(
    &self,
    physical_table: &str,
    workspace_id: &str,
    source_version_high_water: i64,
    limit: usize,
  ) -> RuntimeResult<bool> {
    let limit = limit.max(1);
    let query = json!({"bool":{"must":[
      {"equals":{"workspace_id":workspace_id}},
      {"range":{"source_version":{"lte":source_version_high_water}}}
    ]}});
    let deleted = self.delete_bounded(physical_table, query, limit).await?;
    Ok(deleted == limit)
  }

  async fn delete_bounded(&self, physical_table: &str, query: Value, limit: usize) -> RuntimeResult<usize> {
    let response = self
      .request(reqwest::Method::POST, "search")
      .json(&json!({
        "table":physical_table,
        "query":query,
        "limit":limit,
        "sort":[{"id":"asc"}]
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
      .map_err(|error| RuntimeError::json("invalid manticore GC search response", error))?;
    let ids = value
      .pointer("/hits/hits")
      .and_then(Value::as_array)
      .ok_or_else(|| RuntimeError::invalid_state("invalid manticore GC search response"))?
      .iter()
      .map(|hit| {
        let id = hit
          .get("_id")
          .or_else(|| hit.get("id"))
          .and_then(|id| id.as_u64().or_else(|| id.as_str().and_then(|id| id.parse().ok())))
          .ok_or_else(|| RuntimeError::invalid_state("invalid manticore GC search response"))?;
        Ok(json!(id))
      })
      .collect::<RuntimeResult<Vec<_>>>()?;
    if ids.is_empty() {
      return Ok(0);
    }
    let response = self
      .request(reqwest::Method::POST, "delete")
      .json(&json!({"table":physical_table,"id":ids}))
      .send()
      .await
      .map_err(|_| RuntimeError::SearchProviderUnavailable)?;
    let status = response.status();
    let body = read_response(response).await?;
    if !status.is_success() {
      return Err(RuntimeError::SearchProviderUnavailable);
    }
    let value: Value =
      serde_json::from_slice(&body).map_err(|error| RuntimeError::json("invalid manticore delete response", error))?;
    if value.get("error").is_some() {
      return Err(RuntimeError::invalid_state("provider_apply_failed"));
    }
    Ok(ids.len())
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

fn create_table_sql(physical_table: &str, table: SearchTable) -> String {
  let text_field = table.text_field();
  let mut columns = vec![format!("{text_field} text")];
  for field in [
    "external_id",
    "workspace_id",
    "workspace_token",
    "generation_id",
    "doc_id",
    "doc_token",
    "created_by_user_id",
    "updated_by_user_id",
  ] {
    columns.push(format!("{field} string"));
  }
  for field in ["source_version", "permission_version", "created_at", "updated_at"] {
    columns.push(format!("{field} bigint"));
  }
  columns.push("acl_public_readable integer".to_string());
  columns.push("acl_member_default_readable integer".to_string());
  columns.push("acl_read_tokens text".to_string());
  let extra_fields = if table == SearchTable::Doc {
    vec!["summary string", "journal string"]
  } else {
    vec![
      "block_id string",
      "block_token string",
      "unit_id string",
      "projection_version integer",
      "source_hash string",
      "visibility string",
      "element_id string",
      "frame_id string",
      "source_block_id string",
      "flavour string",
      "blob string",
      "ref_doc_id string",
      "ref string",
      "parent_flavour string",
      "parent_block_id string",
      "additional string",
      "markdown_preview string",
    ]
  };
  columns.extend(extra_fields.into_iter().map(str::to_string));
  format!("CREATE TABLE IF NOT EXISTS {physical_table} ({})", columns.join(", "))
}

fn manticore_document(payload: &Value) -> Map<String, Value> {
  payload
    .as_object()
    .into_iter()
    .flatten()
    .filter(|(_, value)| !value.is_null())
    .map(|(key, value)| {
      let value = match value {
        Value::Bool(value) => json!(i32::from(*value)),
        Value::Array(values) => json!(
          values
            .iter()
            .filter(|value| !value.is_null())
            .map(|value| value.as_str().map(str::to_string).unwrap_or_else(|| value.to_string()))
            .collect::<Vec<_>>()
            .join(" ")
        ),
        value => value.clone(),
      };
      (key.clone(), value)
    })
    .collect()
}

fn document_id(external_id: &str) -> u64 {
  let digest = Sha256::digest(external_id.as_bytes());
  let mut bytes = [0; 8];
  bytes.copy_from_slice(&digest[..8]);
  u64::from_be_bytes(bytes) | 1
}

fn validate_bulk_response(value: &Value, expected_changes: usize) -> RuntimeResult<()> {
  let items = value
    .get("items")
    .and_then(Value::as_array)
    .ok_or_else(|| RuntimeError::invalid_state("invalid manticore bulk response"))?;
  let mut affected = 0_u64;
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
    let numeric = ["created", "updated", "deleted"]
      .into_iter()
      .filter_map(|field| result.get(field).and_then(Value::as_u64))
      .sum::<u64>();
    affected += if numeric > 0 {
      numeric
    } else if result.get("created").and_then(Value::as_bool).is_some()
      || result
        .get("result")
        .and_then(Value::as_str)
        .is_some_and(|result| matches!(result, "created" | "updated"))
    {
      1
    } else {
      return Err(RuntimeError::invalid_state("provider_apply_failed"));
    };
  }
  if value.get("errors").and_then(Value::as_bool) != Some(false) || affected != expected_changes as u64 {
    return Err(RuntimeError::invalid_state("provider_apply_failed"));
  }
  Ok(())
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

fn normalize(value: Value, offset: u64) -> RuntimeResult<Value> {
  let hits = value
    .pointer("/hits/hits")
    .and_then(Value::as_array)
    .ok_or_else(|| RuntimeError::invalid_state("invalid provider response"))?;
  let total = value
    .pointer("/hits/total")
    .and_then(Value::as_u64)
    .ok_or_else(|| RuntimeError::invalid_state("inexact provider total"))?;
  let nodes = hits
    .iter()
    .map(|hit| {
      let source = hit.get("_source").cloned().unwrap_or_else(|| json!({}));
      json!({
        "id":source.get("external_id").and_then(Value::as_str).unwrap_or_default(),
        "score":hit.get("_score").and_then(Value::as_f64).unwrap_or_default(),
        "fields":fields_from_source(&source),
        "highlights":hit.get("highlight").cloned().unwrap_or_else(||json!({})),
        "_source":source,
      })
    })
    .collect::<Vec<_>>();
  let next_cursor = (offset.saturating_add(nodes.len() as u64) < total)
    .then(|| json!({"offset":offset.saturating_add(nodes.len() as u64)}).to_string());
  Ok(json!({"total":total,"nodes":nodes,"nextCursor":next_cursor}))
}

fn fields_from_source(source: &Value) -> Value {
  let Some(source) = source.as_object() else {
    return json!({});
  };
  source
    .iter()
    .map(|(field, value)| (field.clone(), json!([value])))
    .collect::<Map<_, _>>()
    .into()
}

#[cfg(test)]
mod tests {
  use serde_json::json;

  use super::{
    SearchTable, document_id, manticore_document, translate_query, translate_search_request, translate_sort,
    validate_bulk_response,
  };
  use crate::runtime::RuntimeError;

  #[test]
  fn translates_the_shared_basic_query_subset() {
    assert_eq!(
      translate_query(json!({
        "bool":{"must":[
          {"term":{"workspace_id":{"value":"workspace"}}},
          {"match":{"content":{"query":"hello","boost":1.0}}}
        ]}
      }))
      .unwrap(),
      json!({
        "bool":{"must":[
          {"equals":{"workspace_id":"workspace"}},
          {"match":{"content":"hello"}}
        ]}
      })
    );
    assert_eq!(
      translate_search_request(
        "blocks",
        json!({
          "query":{"match":{"content":{"query":"hello"}}},
          "highlight":{"fields":{"content":{"pre_tags":["<b>"],"post_tags":["</b>"]}}}
        })
      )
      .unwrap()["highlight"],
      json!({"fields":["content"],"pre_tags":"<b>","post_tags":"</b>"})
    );
  }

  #[test]
  fn converts_projection_arrays_and_booleans_to_basic_attributes() {
    assert_eq!(
      manticore_document(&json!({"acl_read_tokens":["user","member"],"acl_public_readable":false})),
      json!({"acl_read_tokens":"user member","acl_public_readable":0})
        .as_object()
        .unwrap()
        .clone()
    );
    assert!(
      validate_bulk_response(
        &json!({"errors":false,"items":[{"bulk":{"status":201,"created":2,"updated":0,"deleted":0}}]}),
        2,
      )
      .is_ok()
    );
    assert!(
      validate_bulk_response(
        &json!({"errors":false,"items":[
          {"replace":{"status":201,"created":true}},
          {"replace":{"status":200,"created":false,"result":"updated"}}
        ]}),
        2,
      )
      .is_ok()
    );
    assert!(
      validate_bulk_response(
        &json!({"errors":true,"items":[{"replace":{"status":400,"error":{"reason":"invalid"}}}]}),
        1,
      )
      .is_err()
    );
    assert!(matches!(
      validate_bulk_response(
        &json!({"errors":true,"items":[{"replace":{"status":400,"error":{"reason":"invalid"}}}]}),
        1
      ),
      Err(RuntimeError::SearchGenerationInvalid(_))
    ));
  }

  #[test]
  fn uses_stable_nonzero_document_ids() {
    assert_ne!(document_id("workspace/doc/block"), 0);
    assert_eq!(document_id("workspace/doc/block"), document_id("workspace/doc/block"));
    assert_ne!(
      document_id("generation/workspace/doc/1/1/block"),
      document_id("generation/workspace/doc/2/1/block")
    );
  }

  #[test]
  fn drops_score_sort_but_keeps_basic_attribute_order() {
    assert_eq!(
      translate_sort(&json!(["_score",{"updated_at":"desc"},{"_id":"asc"}])).unwrap(),
      json!([{ "updated_at":"desc" }, { "id":"asc" }])
    );
    assert_eq!(SearchTable::Doc.text_field(), "title");
  }
}
