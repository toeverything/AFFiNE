use std::time::Duration;

use reqwest::{Client, redirect::Policy};
use serde_json::{Value, json};
use sqlx::PgPool;

use super::{
  super::{store::SearchChange, types::SearchTable},
  manticore::{
    manticore_exact_tokens, manticore_fields, prepare_manticore_aggregate, prepare_manticore_aggregate_hit,
    prepare_manticore_payload, prepare_manticore_search,
  },
};
use crate::runtime::{RuntimeError, RuntimeResult, SearchRuntimeConfig};

const MAX_RESPONSE_BYTES: usize = 50 * 1024 * 1024;

pub(in crate::runtime::backend_runtime::search) struct RemoteProvider {
  client: Client,
  endpoint: String,
  provider: String,
  api_key: String,
  username: String,
  password: String,
  pool: PgPool,
}

impl RemoteProvider {
  pub(in crate::runtime::backend_runtime::search) fn new(
    config: &SearchRuntimeConfig,
    pool: PgPool,
  ) -> RuntimeResult<Self> {
    let endpoint = config.endpoint.trim_end_matches('/');
    let url = url::Url::parse(endpoint).map_err(|_| RuntimeError::config("invalid search provider endpoint"))?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
      return Err(RuntimeError::config("invalid search provider endpoint"));
    }
    let client = Client::builder()
      .redirect(Policy::none())
      .timeout(Duration::from_secs(30))
      .build()
      .map_err(|error| RuntimeError::invalid_state(format!("search HTTP client failed: {error}")))?;
    Ok(Self {
      client,
      endpoint: endpoint.to_string(),
      provider: config.provider.clone(),
      api_key: config.api_key.clone(),
      username: config.username.clone(),
      password: config.password.clone(),
      pool,
    })
  }

  pub(in crate::runtime::backend_runtime::search) async fn search(
    &self,
    physical_table: &str,
    mut dsl: Value,
  ) -> RuntimeResult<Value> {
    let requested_fields = dsl
      .get("fields")
      .and_then(Value::as_array)
      .into_iter()
      .flatten()
      .filter_map(Value::as_str)
      .map(str::to_string)
      .collect::<Vec<_>>();
    dsl["track_total_hits"] = json!(true);
    let size = dsl.get("size").and_then(Value::as_u64).unwrap_or(10);
    let mut offset = dsl.get("from").and_then(Value::as_u64).unwrap_or(0);
    let cursor = dsl.as_object_mut().and_then(|object| object.remove("cursor"));
    if self.provider == "manticoresearch" {
      let token_ids = self.resolve_manticore_tokens(manticore_exact_tokens(&dsl)).await?;
      offset = prepare_manticore_search(&mut dsl, cursor, size, offset, &requested_fields, &token_ids)?;
    } else if let Some(cursor) = cursor {
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
    normalize(
      value,
      self.provider == "manticoresearch",
      offset,
      size,
      &requested_fields,
    )
  }

  pub(in crate::runtime::backend_runtime::search) async fn aggregate(
    &self,
    physical_table: &str,
    mut dsl: Value,
  ) -> RuntimeResult<Value> {
    if self.provider == "manticoresearch" {
      return self.aggregate_manticore(physical_table, dsl).await;
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
      return Err(RuntimeError::SearchUnsupportedQuery);
    }
    let value: Value =
      serde_json::from_slice(&bytes).map_err(|error| RuntimeError::json("invalid search provider response", error))?;
    normalize_aggregate(value)
  }

  async fn aggregate_manticore(&self, physical_table: &str, mut dsl: Value) -> RuntimeResult<Value> {
    let token_ids = self.resolve_manticore_tokens(manticore_exact_tokens(&dsl)).await?;
    let plan = prepare_manticore_aggregate(&mut dsl, &token_ids)?;
    let response = self
      .request(reqwest::Method::POST, &format!("{physical_table}/_search"))
      .json(&plan.facet)
      .send()
      .await
      .map_err(|_| RuntimeError::SearchProviderUnavailable)?;
    let status = response.status();
    let bytes = read_response(response).await?;
    if !status.is_success() {
      return Err(RuntimeError::SearchUnsupportedQuery);
    }
    let facet: Value =
      serde_json::from_slice(&bytes).map_err(|error| RuntimeError::json("invalid search provider response", error))?;
    let buckets = facet
      .pointer("/aggregations/result/buckets")
      .and_then(Value::as_array)
      .ok_or_else(|| RuntimeError::invalid_state("invalid provider aggregate response"))?;
    if buckets.is_empty() {
      return Ok(json!({"total":0,"hasMore":false,"buckets":[]}));
    }

    let mut token_ids = token_ids;
    if matches!(plan.field.as_str(), "acl_read_tokens" | "ref_doc_id") {
      token_ids.extend(
        self
          .resolve_manticore_tokens(
            buckets
              .iter()
              .filter_map(|bucket| bucket.get("key")?.as_str().map(str::to_string)),
          )
          .await?,
      );
    }
    let hit_size = plan.hits.get("size").and_then(Value::as_u64).unwrap_or(10);
    let mut body = String::new();
    for bucket in buckets {
      let key = bucket
        .get("key")
        .ok_or_else(|| RuntimeError::invalid_state("invalid provider aggregate bucket"))?;
      let hit = prepare_manticore_aggregate_hit(&plan, key, &token_ids)?;
      body.push_str(
        &serde_json::to_string(&json!({"index":physical_table}))
          .map_err(|error| RuntimeError::json("encode provider multi-search header", error))?,
      );
      body.push('\n');
      body.push_str(
        &serde_json::to_string(&hit)
          .map_err(|error| RuntimeError::json("encode provider multi-search query", error))?,
      );
      body.push('\n');
    }
    let response = self
      .request(reqwest::Method::POST, "_msearch")
      .header("content-type", "application/x-ndjson")
      .body(body)
      .send()
      .await
      .map_err(|_| RuntimeError::SearchProviderUnavailable)?;
    let status = response.status();
    let bytes = read_response(response).await?;
    if !status.is_success() {
      return Err(RuntimeError::SearchUnsupportedQuery);
    }
    let searches: Value =
      serde_json::from_slice(&bytes).map_err(|error| RuntimeError::json("invalid search provider response", error))?;
    let responses = searches
      .get("responses")
      .and_then(Value::as_array)
      .filter(|responses| responses.len() == buckets.len())
      .ok_or_else(|| RuntimeError::invalid_state("invalid provider multi-search response"))?;
    let buckets = buckets
      .iter()
      .zip(responses)
      .map(|(bucket, response)| {
        let hits = normalize(response.clone(), true, 0, hit_size, &plan.requested_fields)?;
        Ok(json!({
          "key":bucket.get("key").cloned().unwrap_or(Value::Null),
          "count":bucket.get("doc_count").cloned().unwrap_or(json!(0)),
          "hits":hits
        }))
      })
      .collect::<RuntimeResult<Vec<_>>>()?;
    let total = facet
      .pointer("/hits/total/value")
      .or_else(|| facet.pointer("/hits/total"))
      .and_then(Value::as_u64)
      .unwrap_or(buckets.len() as u64);
    Ok(json!({"total":total,"hasMore":false,"buckets":buckets}))
  }

  pub(in crate::runtime::backend_runtime::search) async fn provision(
    &self,
    physical_table: &str,
    table: SearchTable,
  ) -> RuntimeResult<()> {
    if self.provider == "manticoresearch" {
      let response = self
        .request(reqwest::Method::POST, "cli")
        .header("content-type", "text/plain")
        .body(super::manticore_schema(table, physical_table))
        .send()
        .await
        .map_err(|_| RuntimeError::SearchProviderUnavailable)?;
      return response
        .status()
        .is_success()
        .then_some(())
        .ok_or(RuntimeError::SearchProviderUnavailable);
    }
    if self
      .request(reqwest::Method::HEAD, physical_table)
      .send()
      .await
      .is_ok_and(|response| response.status().is_success())
    {
      return Ok(());
    }
    let response = self
      .request(reqwest::Method::PUT, physical_table)
      .json(&super::mapping(table, &self.provider))
      .send()
      .await;
    match response {
      Ok(response) if response.status().is_success() => Ok(()),
      _ => Err(RuntimeError::SearchProviderUnavailable),
    }
  }

  pub(in crate::runtime::backend_runtime::search) async fn apply(
    &self,
    physical_table: &str,
    changes: &[SearchChange],
  ) -> RuntimeResult<()> {
    if changes.is_empty() {
      return Ok(());
    }
    let token_ids = if self.provider == "manticoresearch" {
      self
        .resolve_manticore_tokens(
          changes
            .iter()
            .filter_map(|change| change.payload.as_ref())
            .flat_map(manticore_exact_tokens),
        )
        .await?
    } else {
      Default::default()
    };
    let mut body = String::new();
    for change in changes {
      if change.operation == "delete" {
        body.push_str(
          &serde_json::to_string(&json!({"delete":{"_index":physical_table,"_id":change.external_id}}))
            .map_err(|error| RuntimeError::json("encode provider delete", error))?,
        );
        body.push('\n');
      } else if let Some(payload) = &change.payload {
        body.push_str(
          &serde_json::to_string(&json!({"index":{"_index":physical_table,"_id":change.external_id}}))
            .map_err(|error| RuntimeError::json("encode provider upsert", error))?,
        );
        body.push('\n');
        let mut payload = super::super::provider_payload(payload);
        if self.provider == "manticoresearch" {
          prepare_manticore_payload(&mut payload, &token_ids)?;
        }
        body.push_str(
          &serde_json::to_string(&payload).map_err(|error| RuntimeError::json("encode provider document", error))?,
        );
        body.push('\n');
      }
    }
    let path = if self.provider == "elasticsearch" {
      "_bulk?refresh=wait_for"
    } else {
      "_bulk"
    };
    let response = self
      .request(reqwest::Method::POST, path)
      .header("content-type", "application/x-ndjson")
      .body(body)
      .send()
      .await
      .map_err(|_| RuntimeError::SearchProviderUnavailable)?;
    if !response.status().is_success() {
      return Err(RuntimeError::SearchProviderUnavailable);
    }
    let value: Value = response
      .json()
      .await
      .map_err(|error| RuntimeError::invalid_state(format!("invalid provider bulk response: {error}")))?;
    if value.get("errors").and_then(Value::as_bool) == Some(true) {
      return Err(RuntimeError::invalid_state("provider_apply_failed"));
    }
    Ok(())
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

  async fn resolve_manticore_tokens(
    &self,
    tokens: impl IntoIterator<Item = String>,
  ) -> RuntimeResult<std::collections::HashMap<String, i64>> {
    let tokens = tokens.into_iter().collect::<std::collections::BTreeSet<_>>();
    if tokens.is_empty() {
      return Ok(Default::default());
    }
    let tokens = tokens.into_iter().collect::<Vec<_>>();
    let mut transaction = self
      .pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("begin Manticore exact token resolution", error))?;
    sqlx::query(
      r#"INSERT INTO search_runtime_acl_tokens(token)
         SELECT candidate.token FROM unnest($1::text[]) candidate(token)
         LEFT JOIN search_runtime_acl_tokens existing USING(token)
         WHERE existing.token IS NULL ON CONFLICT DO NOTHING"#,
    )
    .bind(&tokens)
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("allocate Manticore exact token IDs", error))?;
    let rows: Vec<(String, i64)> =
      sqlx::query_as("SELECT token,token_id FROM search_runtime_acl_tokens WHERE token=ANY($1)")
        .bind(&tokens)
        .fetch_all(&mut *transaction)
        .await
        .map_err(|error| RuntimeError::database("load Manticore exact token IDs", error))?;
    transaction
      .commit()
      .await
      .map_err(|error| RuntimeError::database("commit Manticore exact token resolution", error))?;
    if rows.len() != tokens.len() {
      return Err(RuntimeError::invalid_state(
        "Manticore exact token mapping is incomplete",
      ));
    }
    Ok(rows.into_iter().collect())
  }
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

fn normalize(
  value: Value,
  manticore: bool,
  _offset: u64,
  _size: u64,
  requested_fields: &[String],
) -> RuntimeResult<Value> {
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
      let fields = if manticore {
        manticore_fields(hit.get("_source"), requested_fields)
      } else {
        hit.get("fields").cloned().unwrap_or_else(|| json!({}))
      };
      json!({
        "id":hit.get("_id").and_then(Value::as_str).unwrap_or_default(),
        "score":hit.get("_score").and_then(Value::as_f64).unwrap_or_default(),
        "fields":fields,
        "highlights":hit.get("highlight").cloned().unwrap_or_else(||json!({})),
        "_source":hit.get("_source").cloned().unwrap_or_else(||json!({})),
      })
    })
    .collect::<Vec<_>>();
  let next_cursor = if manticore {
    (!hits.is_empty())
      .then(|| serde_json::to_string(&json!({"offset":_offset + _size})))
      .transpose()
      .map_err(|error| RuntimeError::json("encode provider cursor", error))?
  } else {
    hits
      .last()
      .and_then(|hit| hit.get("sort"))
      .map(serde_json::to_string)
      .transpose()
      .map_err(|error| RuntimeError::json("encode provider cursor", error))?
  };
  Ok(json!({"total":total,"nodes":nodes,"nextCursor":next_cursor}))
}

fn normalize_aggregate(value: Value) -> RuntimeResult<Value> {
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
        "hits":{"total":bucket.pointer("/result/hits/total/value").or_else(||bucket.pointer("/result/hits/total")).cloned().unwrap_or(json!(0)),
          "nodes":hits.iter().map(normalize_hit).collect::<Vec<_>>()}
      }))
    })
    .collect::<RuntimeResult<Vec<_>>>()?;
  Ok(json!({"total":nodes.len(),"hasMore":false,"buckets":nodes}))
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
