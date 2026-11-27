//! Stateless Workspace MCP JSON-RPC 2.0 endpoint (`/api/workspaces/{workspace_id}/mcp`).

use std::collections::{HashMap, HashSet};
use std::net::SocketAddr;
use std::time::{Duration, Instant};

use axum::Router;
use axum::extract::{ConnectInfo, Path, State};
use axum::http::header::{self, HeaderName, HeaderValue};
use axum::http::{Extensions, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use serde_json::{Map, Value, json};
use server_domain::mcp::{McpAccessMode, clamp_throttle_tracker, is_reserved_doc_id};
use server_search::{
  AggregateHitsOptions, AggregateOptions, AggregateRequest, SearchError, SearchHighlight, SearchOptions,
  SearchPagination, SearchQuery, SearchRequest, SearchTable,
};
use server_types::DomainError;

use crate::RouterState;
use crate::graphql::mcp::{assert_copilot_enabled, mcp_read_write_available};
use crate::rest::{domain_error_to_http_response, extract_bearer_token, json_utf8_response};

const JSON_RPC_VERSION: &str = "2.0";
const MAX_BATCH_SIZE: usize = 20;
const DEFAULT_PROTOCOL_VERSION: &str = "2025-03-26";
const SUPPORTED_PROTOCOL_VERSIONS: &[&str] = &["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"];
const DEFAULT_THROTTLE_LIMIT: u64 = 120;
const DEFAULT_THROTTLE_TTL_MS: u64 = 60_000;
const MAX_FALLBACK_THROTTLE_ENTRIES: usize = 4096;
const THROTTLE_LUA_SCRIPT: &str = r#"local now = redis.call("TIME")
local nowMs = now[1] * 1000 + math.floor(now[2] / 1000)
local blockedUntil = tonumber(redis.call("HGET", KEYS[1], "blockedUntil")) or 0
if blockedUntil > nowMs then
  return { tonumber(redis.call("HGET", KEYS[1], "hits")) or 0, redis.call("PTTL", KEYS[1]), blockedUntil - nowMs }
end
if blockedUntil > 0 then
  redis.call("HDEL", KEYS[1], "blockedUntil")
  redis.call("HSET", KEYS[1], "hits", 0)
end
local hits = redis.call("HINCRBY", KEYS[1], "hits", 1)
if hits == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
local blockTtl = 0
if hits > tonumber(ARGV[2]) then
  blockedUntil = nowMs + tonumber(ARGV[3])
  redis.call("HSET", KEYS[1], "blockedUntil", blockedUntil)
  if redis.call("PTTL", KEYS[1]) < tonumber(ARGV[3]) then redis.call("PEXPIRE", KEYS[1], ARGV[3]) end
  blockTtl = tonumber(ARGV[3])
end
return { hits, redis.call("PTTL", KEYS[1]), blockTtl }"#;
#[derive(Clone, Copy, Debug)]
struct ThrottleDecision {
  allowed: bool,
  limit: u64,
  remaining: u64,
  reset_secs: u64,
  retry_after_secs: u64,
}
#[derive(Clone, Copy, Debug)]
struct MemoryThrottleEntry {
  hits: u64,
  window_exp: Instant,
  blocked_until: Option<Instant>,
}
/// Fixed-window `@Throttle('default')` rate limiter for the Workspace MCP endpoint.
pub struct McpDefaultThrottler {
  redis: Option<redis::Client>,
  conn: tokio::sync::Mutex<Option<redis::aio::MultiplexedConnection>>,
  fallback: std::sync::Mutex<HashMap<String, MemoryThrottleEntry>>,
}
impl McpDefaultThrottler {
  pub fn new(redis: Option<redis::Client>) -> Self {
    Self {
      redis,
      conn: tokio::sync::Mutex::new(None),
      fallback: std::sync::Mutex::new(HashMap::new()),
    }
  }
  async fn check(&self, key: &str, limit: u64, ttl_ms: u64) -> ThrottleDecision {
    if let Some(decision) = self.check_redis(key, limit, ttl_ms).await {
      return decision;
    }
    self.check_memory(key, limit, ttl_ms)
  }
  async fn check_redis(&self, key: &str, limit: u64, ttl_ms: u64) -> Option<ThrottleDecision> {
    let client = self.redis.as_ref()?;
    let cached = self.conn.lock().await.clone();
    let mut conn = match cached {
      Some(c) => c,
      None => {
        let fresh = tokio::time::timeout(Duration::from_secs(2), client.get_multiplexed_async_connection())
          .await
          .ok()?
          .ok()?;
        *self.conn.lock().await = Some(fresh.clone());
        fresh
      }
    };
    let res: Result<(u64, i64, i64), redis::RedisError> = redis::Script::new(THROTTLE_LUA_SCRIPT)
      .key(key)
      .arg(ttl_ms)
      .arg(limit)
      .arg(ttl_ms.max(1))
      .invoke_async(&mut conn)
      .await;
    match res {
      Ok((hits, pttl_ms, block_ttl_ms)) => {
        let retry_after_secs = (block_ttl_ms.max(0) as u64).div_ceil(1000);
        let is_blocked = retry_after_secs > 0;
        Some(ThrottleDecision {
          allowed: !is_blocked,
          limit,
          remaining: if is_blocked { 0 } else { limit.saturating_sub(hits) },
          reset_secs: (pttl_ms.max(0) as u64).div_ceil(1000),
          retry_after_secs,
        })
      }
      Err(_) => {
        *self.conn.lock().await = None;
        None
      }
    }
  }
  fn check_memory(&self, key: &str, limit: u64, ttl_ms: u64) -> ThrottleDecision {
    let now = Instant::now();
    let secs = |t: Instant| t.saturating_duration_since(now).as_millis().div_ceil(1000) as u64;
    let deny = |r, ra| ThrottleDecision {
      allowed: false,
      limit,
      remaining: 0,
      reset_secs: r,
      retry_after_secs: ra,
    };
    let mut map = self.fallback.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(e) = map.get(key) {
      if let Some(bu) = e.blocked_until
        && bu > now
      {
        return deny(secs(e.window_exp), secs(bu).max(1));
      }
      if e.blocked_until.is_some() || now >= e.window_exp {
        map.remove(key);
      }
    }
    if !map.contains_key(key) && map.len() >= MAX_FALLBACK_THROTTLE_ENTRIES {
      map.retain(|_, e| e.window_exp > now || e.blocked_until.is_some_and(|b| b > now));
      if map.len() >= MAX_FALLBACK_THROTTLE_ENTRIES
        && let Some(old) = map
          .iter()
          .min_by_key(|(_, e)| e.blocked_until.map_or(e.window_exp, |b| b.max(e.window_exp)))
          .map(|(k, _)| k.clone())
      {
        map.remove(&old);
      }
    }
    let e = map.entry(key.to_owned()).or_insert(MemoryThrottleEntry {
      hits: 0,
      window_exp: now + Duration::from_millis(ttl_ms),
      blocked_until: None,
    });
    e.hits = e.hits.saturating_add(1);
    if e.hits > limit {
      let bu = now + Duration::from_millis(ttl_ms.max(1));
      e.blocked_until = Some(bu);
      e.window_exp = e.window_exp.max(bu);
      return deny(secs(e.window_exp), ttl_ms.max(1).div_ceil(1000).max(1));
    }
    ThrottleDecision {
      allowed: true,
      limit,
      remaining: limit.saturating_sub(e.hits),
      reset_secs: secs(e.window_exp),
      retry_after_secs: 0,
    }
  }
}
fn header_trimmed(headers: &HeaderMap, name: &str) -> Option<String> {
  let s = headers.get(name)?.to_str().ok()?.trim();
  (!s.is_empty()).then(|| s.to_owned())
}
fn extract_throttle_tracker(headers: &HeaderMap, peer_addr: Option<SocketAddr>) -> String {
  if let Some(ip) = header_trimmed(headers, "cf-connecting-ip") {
    return ip;
  }
  if let Some(first) = headers
    .get("x-forwarded-for")
    .and_then(|v| v.to_str().ok())
    .and_then(|s| s.split(',').next())
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    return first.to_owned();
  }
  header_trimmed(headers, "x-real-ip")
    .or_else(|| header_trimmed(headers, "cf-ray"))
    .or_else(|| peer_addr.map(|a| a.ip().to_string()))
    .unwrap_or_default()
}
async fn load_default_throttle_config(state: &crate::AppState) -> Option<(u64, u64)> {
  let Ok(effective) = state.app_config.get_effective_app_config().await else {
    return Some((DEFAULT_THROTTLE_LIMIT, DEFAULT_THROTTLE_TTL_MS));
  };
  if effective.pointer("/throttle/enabled").and_then(Value::as_bool) == Some(false) {
    return None;
  }
  let pos_u64 = |p: &str, d: u64| {
    effective
      .pointer(p)
      .and_then(Value::as_u64)
      .filter(|&v| v > 0)
      .unwrap_or(d)
  };
  Some((
    pos_u64("/throttle/throttlers/default/limit", DEFAULT_THROTTLE_LIMIT),
    pos_u64("/throttle/throttlers/default/ttl", DEFAULT_THROTTLE_TTL_MS),
  ))
}
fn apply_rate_limit_headers(mut resp: Response, decision: ThrottleDecision, blocked: bool) -> Response {
  let h = resp.headers_mut();
  let mut set = |name: HeaderName, val: u64| {
    if let Ok(v) = HeaderValue::from_str(&val.to_string()) {
      h.insert(name, v);
    }
  };
  if blocked {
    set(header::RETRY_AFTER, decision.retry_after_secs.max(1));
  } else {
    set(HeaderName::from_static("x-ratelimit-limit"), decision.limit);
    set(HeaderName::from_static("x-ratelimit-remaining"), decision.remaining);
    set(HeaderName::from_static("x-ratelimit-reset"), decision.reset_secs);
  }
  resp
}
pub(crate) fn router() -> Router<RouterState> {
  Router::new().route(
    "/api/workspaces/{workspace_id}/mcp",
    get(handle_method_not_allowed)
      .delete(handle_method_not_allowed)
      .post(handle_mcp_post),
  )
}
fn rpc_error(id: Value, code: i64, message: impl Into<String>) -> Value {
  json!({ "jsonrpc": JSON_RPC_VERSION, "error": { "code": code, "message": message.into() }, "id": id })
}
fn rpc_success(id: Value, result: Value) -> Value {
  json!({ "jsonrpc": JSON_RPC_VERSION, "result": result, "id": id })
}
fn tool_text(text: impl Into<String>) -> Value {
  json!({ "content": [{ "type": "text", "text": text.into() }] })
}
fn tool_error(message: impl Into<String>) -> Value {
  json!({ "isError": true, "content": [{ "type": "text", "text": message.into() }] })
}
fn rpc_err_resp(status: StatusCode, code: i64, msg: impl Into<String>) -> Response {
  json_utf8_response(status, rpc_error(Value::Null, code, msg), true)
}
async fn handle_method_not_allowed(State(state): State<RouterState>) -> Response {
  if let Err(err) = assert_copilot_enabled(&state.app).await {
    return domain_error_to_http_response(&err);
  }
  rpc_err_resp(StatusCode::METHOD_NOT_ALLOWED, -32000, "Method not allowed.")
}
async fn handle_mcp_post(
  State(state): State<RouterState>,
  Path(workspace_id): Path<String>,
  extensions: Extensions,
  headers: HeaderMap,
  raw_body: axum::body::Bytes,
) -> Response {
  let body: Value = match serde_json::from_slice(&raw_body) {
    Ok(v) => v,
    Err(_) => return rpc_err_resp(StatusCode::BAD_REQUEST, -32700, "Parse error"),
  };
  let throttle_decision = if let Some((limit, ttl_ms)) = load_default_throttle_config(&state.app).await {
    let peer_addr = extensions.get::<ConnectInfo<SocketAddr>>().map(|c| c.0);
    let tracker = clamp_throttle_tracker(&extract_throttle_tracker(&headers, peer_addr));
    let key = format!("throttler:{tracker};default");
    let decision = state.app.mcp_throttler.check(&key, limit, ttl_ms).await;
    if !decision.allowed {
      let resp = domain_error_to_http_response(&DomainError::RateLimited("Too many requests.".to_owned()));
      return apply_rate_limit_headers(resp, decision, true);
    }
    Some(decision)
  } else {
    None
  };
  let resp = match assert_copilot_enabled(&state.app).await {
    Err(err) => domain_error_to_http_response(&err),
    Ok(()) => handle_mcp_post_inner(state, workspace_id, headers, body).await,
  };
  match throttle_decision {
    Some(decision) => apply_rate_limit_headers(resp, decision, false),
    None => resp,
  }
}
async fn handle_mcp_post_inner(state: RouterState, workspace_id: String, headers: HeaderMap, body: Value) -> Response {
  let token = extract_bearer_token(&headers).unwrap_or_default();
  let credential = match state.app.mcp.authenticate(token, &workspace_id).await {
    Ok(cred) => cred,
    Err(DomainError::Unauthorized(_)) => {
      return rpc_err_resp(StatusCode::UNAUTHORIZED, -32000, "Authentication failed");
    }
    Err(_) => return rpc_err_resp(StatusCode::INTERNAL_SERVER_ERROR, -32603, "Internal error"),
  };
  let perms = match state
    .app
    .workspaces
    .resolve_workspace_permissions(&credential.user_id, &workspace_id)
    .await
  {
    Ok(p) if p.read => p,
    Ok(_) | Err(DomainError::Forbidden(_) | DomainError::NotFound(_)) => {
      return rpc_err_resp(StatusCode::FORBIDDEN, -32000, "Access denied");
    }
    Err(_) => return rpc_err_resp(StatusCode::INTERNAL_SERVER_ERROR, -32603, "Internal error"),
  };
  let write_tools_enabled = credential.access_mode == McpAccessMode::ReadWrite && mcp_read_write_available(&state.app);
  let (is_batch, messages) = match body {
    Value::Array(arr) => (true, arr),
    other => (false, vec![other]),
  };
  if messages.is_empty() {
    return rpc_err_resp(StatusCode::BAD_REQUEST, -32600, "Invalid Request");
  }
  if messages.len() > MAX_BATCH_SIZE {
    return rpc_err_resp(
      StatusCode::BAD_REQUEST,
      -32600,
      format!("Batch size exceeds limit ({MAX_BATCH_SIZE})."),
    );
  }
  let mut responses = Vec::new();
  for msg in messages {
    if let Some(resp) = handle_rpc_message(
      &state,
      &workspace_id,
      &credential.user_id,
      perms.create_doc,
      write_tools_enabled,
      msg,
    )
    .await
    {
      responses.push(resp);
    }
  }
  if responses.is_empty() {
    return StatusCode::ACCEPTED.into_response();
  }
  let payload = if is_batch {
    Value::Array(responses)
  } else {
    responses.into_iter().next().unwrap_or(Value::Null)
  };
  json_utf8_response(StatusCode::OK, payload, true)
}
fn parse_request_id(obj: &Map<String, Value>) -> Result<Option<Value>, ()> {
  match obj.get("id") {
    None => Ok(None),
    Some(v @ (Value::Null | Value::String(_) | Value::Number(_))) => Ok(Some(v.clone())),
    Some(_) => Err(()),
  }
}
fn build_tool_list(write_tools_enabled: bool) -> Vec<Value> {
  let mut tools = vec![
    json!({
      "name": "read_document",
      "title": "Read Document",
      "description": "Read a document with given ID",
      "inputSchema": {
        "type": "object",
        "properties": {
          "docId": { "type": "string", "description": "The ID of the document to read." }
        },
        "required": ["docId"],
        "additionalProperties": false
      }
    }),
    json!({
      "name": "doc_search",
      "title": "Document Search",
      "description": "Search persisted workspace documents and return bounded passages with Page or canvas locators.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": { "type": "string", "description": "Search query string (1 to 2000 characters)." },
          "doc_ids": { "type": "array", "items": { "type": "string" }, "maxItems": 50, "description": "Optional list of document IDs to restrict search scope." },
          "limit": { "type": "integer", "minimum": 1, "maximum": 20, "description": "Maximum number of document hits to return (1 to 20)." }
        },
        "required": ["query"],
        "additionalProperties": false
      }
    }),
  ];
  if write_tools_enabled {
    tools.extend([
      json!({
        "name": "create_document",
        "title": "Create Document",
        "description": "Create a new document in the workspace with the given title and markdown content.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "title": { "type": "string", "description": "Title of the new document." },
            "content": { "type": "string", "description": "Markdown body content of the new document." },
            "docId": { "type": "string", "description": "Optional explicit document ID." }
          },
          "required": ["title", "content"],
          "additionalProperties": false
        }
      }),
      json!({
        "name": "update_document",
        "title": "Update Document",
        "description": "Update an existing document with new markdown content (body only).",
        "inputSchema": {
          "type": "object",
          "properties": {
            "docId": { "type": "string", "description": "ID of the document to update." },
            "content": { "type": "string", "description": "Replacement markdown body content." }
          },
          "required": ["docId", "content"],
          "additionalProperties": false
        }
      }),
      json!({
        "name": "update_document_meta",
        "title": "Update Document Metadata",
        "description": "Update document metadata (currently title only).",
        "inputSchema": {
          "type": "object",
          "properties": {
            "docId": { "type": "string", "description": "ID of the document whose metadata will be updated." },
            "title": { "type": "string", "description": "New title for the document." }
          },
          "required": ["docId", "title"],
          "additionalProperties": false
        }
      }),
    ]);
  }
  tools
}
async fn handle_rpc_message(
  state: &RouterState,
  workspace_id: &str,
  user_id: &str,
  can_create_doc: bool,
  write_tools_enabled: bool,
  message: Value,
) -> Option<Value> {
  let Some(obj) = message.as_object() else {
    return Some(rpc_error(Value::Null, -32600, "Invalid Request"));
  };
  if obj.get("jsonrpc").and_then(Value::as_str) != Some(JSON_RPC_VERSION) {
    return Some(rpc_error(Value::Null, -32600, "Invalid Request"));
  }
  let Some(method) = obj.get("method").and_then(Value::as_str) else {
    return Some(rpc_error(Value::Null, -32600, "Invalid Request"));
  };
  let Ok(id_opt) = parse_request_id(obj) else {
    return Some(rpc_error(Value::Null, -32600, "Invalid Request"));
  };
  let is_notification = id_opt.is_none();
  let response_id = id_opt.unwrap_or(Value::Null);
  match method {
    "initialize" => {
      if is_notification {
        return None;
      }
      let requested = obj
        .get("params")
        .and_then(Value::as_object)
        .and_then(|p| p.get("protocolVersion"))
        .and_then(Value::as_str)
        .unwrap_or(DEFAULT_PROTOCOL_VERSION);
      let version = if SUPPORTED_PROTOCOL_VERSIONS.contains(&requested) {
        requested
      } else {
        DEFAULT_PROTOCOL_VERSION
      };
      Some(rpc_success(
        response_id,
        json!({
          "protocolVersion": version,
          "capabilities": { "tools": {} },
          "serverInfo": { "name": format!("AFFiNE MCP Server for Workspace {workspace_id}"), "version": "1.0.1" }
        }),
      ))
    }
    "notifications/initialized" | "ping" => (!is_notification).then(|| rpc_success(response_id, json!({}))),
    "tools/list" => {
      (!is_notification).then(|| rpc_success(response_id, json!({ "tools": build_tool_list(write_tools_enabled) })))
    }
    "tools/call" => {
      let Some(params) = obj.get("params").and_then(Value::as_object) else {
        return Some(rpc_error(response_id, -32602, "Invalid params"));
      };
      let Some(tool_name) = params.get("name").and_then(Value::as_str) else {
        return Some(rpc_error(response_id, -32602, "Invalid params"));
      };
      let args = params
        .get("arguments")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
      let allowed = matches!(tool_name, "read_document" | "doc_search")
        || (write_tools_enabled
          && matches!(
            tool_name,
            "create_document" | "update_document" | "update_document_meta"
          ));
      if !allowed {
        return Some(rpc_error(response_id, -32602, format!("Tool not found: {tool_name}")));
      }
      let result = execute_tool(state, workspace_id, user_id, can_create_doc, tool_name, &args).await;
      (!is_notification).then(|| match result {
        Ok(val) => rpc_success(response_id, val),
        Err((code, msg)) => rpc_error(response_id, code, msg),
      })
    }
    _ => (!is_notification).then(|| rpc_error(response_id, -32601, "Method not found")),
  }
}
fn truncate_utf16(s: &str, max_units: usize) -> String {
  let mut units = 0;
  let mut end = 0;
  for (idx, ch) in s.char_indices() {
    let len = ch.len_utf16();
    if units + len > max_units {
      break;
    }
    units += len;
    end = idx + ch.len_utf8();
  }
  s[..end].to_owned()
}
const BLOCK_SEARCH_FIELDS: &str = "doc_id block_id unit_id projection_version source_hash visibility element_id frame_id source_block_id flavour content";
fn search_node_val<'a>(node: &'a Value, field: &str) -> Option<&'a Value> {
  node
    .pointer(&format!("/fields/{field}/0"))
    .or_else(|| node.pointer(&format!("/_source/{field}")))
    .or_else(|| node.get(field))
}
fn search_node_str<'a>(node: &'a Value, field: &str) -> Option<&'a str> {
  search_node_val(node, field).and_then(Value::as_str)
}
fn search_node_non_empty<'a>(node: &'a Value, field: &str) -> Option<&'a str> {
  search_node_str(node, field).filter(|s| !s.is_empty())
}
pub fn inline_page_title(node: &Value) -> Option<&str> {
  (search_node_non_empty(node, "flavour") == Some("affine:page"))
    .then(|| search_node_non_empty(node, "content"))
    .flatten()
}
pub fn has_projection_metadata(node: &Value) -> bool {
  let has_ver = search_node_val(node, "projection_version").is_some_and(|v| match v {
    Value::Number(n) => n.as_f64().is_some_and(|f| f != 0.0 && f.is_finite()),
    Value::String(s) => !s.is_empty(),
    _ => false,
  });
  has_ver
    && ["unit_id", "source_hash", "visibility"]
      .iter()
      .all(|f| search_node_non_empty(node, f).is_some())
}
pub fn select_aggregate_bucket_nodes(agg: &Value) -> Vec<Value> {
  agg
    .get("buckets")
    .and_then(Value::as_array)
    .into_iter()
    .flatten()
    .filter_map(|b| {
      b.get("hits")
        .and_then(|h| h.as_array().or_else(|| h.get("nodes").and_then(Value::as_array)))
        .and_then(|a| a.first())
        .cloned()
    })
    .collect()
}
pub fn select_fallback_search_nodes(search_res: &Value, candidate_limit: usize) -> Vec<Value> {
  let mut seen = HashSet::new();
  search_res
    .get("nodes")
    .and_then(Value::as_array)
    .into_iter()
    .flatten()
    .filter(|n| search_node_non_empty(n, "doc_id").is_some_and(|d| seen.insert(d.to_owned())))
    .take(candidate_limit)
    .cloned()
    .collect()
}
fn build_scoped_search_query(field: &str, query_str: &str, doc_ids: &[String], boost_page: bool) -> SearchQuery {
  let base = |t: &str| SearchQuery {
    query_type: t.to_owned(),
    field: None,
    match_value: None,
    query: None,
    queries: None,
    occur: None,
    boost: None,
  };
  let mq = |f: &str, v: &str| SearchQuery {
    field: Some(f.to_owned()),
    match_value: Some(v.to_owned()),
    ..base("match")
  };
  let bq = |qs: Vec<SearchQuery>, occ: &str| SearchQuery {
    queries: Some(qs),
    occur: Some(occ.to_owned()),
    ..base("boolean")
  };
  let content_q = if boost_page {
    let pb = SearchQuery {
      query: Some(Box::new(mq("flavour", "affine:page"))),
      boost: Some(1.5),
      ..base("boost")
    };
    bq(
      vec![mq(field, query_str), bq(vec![mq(field, query_str), pb], "should")],
      "must",
    )
  } else {
    mq(field, query_str)
  };
  if doc_ids.is_empty() {
    return content_q;
  }
  bq(
    vec![
      content_q,
      bq(doc_ids.iter().map(|id| mq("doc_id", id)).collect(), "should"),
    ],
    "must",
  )
}
async fn check_doc_perm(state: &RouterState, ws: &str, uid: &str, doc: &str, write: bool) -> Result<bool, Value> {
  match state.app.doc_sharing.get_doc_permissions(ws, Some(uid), doc).await {
    Ok(Some(p)) => Ok(if write { p.doc_update } else { p.doc_read }),
    Ok(None) => Ok(false),
    Err(_) => Err(tool_error("Failed to check document permissions.")),
  }
}
async fn require_doc_perm(state: &RouterState, ws: &str, uid: &str, doc: &str, write: bool) -> Result<(), Value> {
  if !is_reserved_doc_id(ws, doc) && check_doc_perm(state, ws, uid, doc, write).await? {
    Ok(())
  } else {
    Err(tool_error(format!("Doc with id {doc} not found.")))
  }
}
fn map_doc_write_err(action: &str, err: DomainError) -> Value {
  match err {
    DomainError::NotFound(_) => tool_error(format!("Failed to {action}: document not found.")),
    DomainError::Validation(_) => tool_error(format!("Failed to {action}: invalid document structure.")),
    DomainError::QuotaExceeded { .. } => tool_error(format!("Failed to {action}: workspace is read-only.")),
    _ => tool_error(format!("Failed to {action}.")),
  }
}
async fn execute_tool(
  state: &RouterState,
  workspace_id: &str,
  user_id: &str,
  can_create_doc: bool,
  tool_name: &str,
  args: &Map<String, Value>,
) -> Result<Value, (i64, String)> {
  let mcp_svc = &state.app.mcp;
  match tool_name {
    "read_document" => {
      let Some(doc_id) = args.get("docId").and_then(Value::as_str) else {
        return Ok(tool_error("Invalid arguments: docId: Required"));
      };
      if let Err(e) = require_doc_perm(state, workspace_id, user_id, doc_id, false).await {
        return Ok(e);
      }
      Ok(match mcp_svc.read_document_markdown(workspace_id, doc_id).await {
        Ok(Some(md)) => tool_text(md),
        Ok(None) => tool_error(format!("Doc with id {doc_id} not found.")),
        Err(_) => tool_error("Failed to read document."),
      })
    }
    "doc_search" => {
      let Some(raw_query) = args.get("query").and_then(Value::as_str) else {
        return Ok(tool_error("Invalid arguments: query: Required"));
      };
      let query_str = raw_query.trim();
      let query_u16 = query_str.encode_utf16().count();
      if query_u16 == 0 || query_u16 > 2000 {
        return Ok(tool_error("Invalid arguments: query must be 1..=2000 characters"));
      }
      let mut explicit_empty_doc_ids = false;
      let mut doc_ids: Vec<String> = Vec::new();
      if let Some(raw_doc_ids) = args.get("doc_ids") {
        let Some(arr) = raw_doc_ids.as_array().filter(|a| a.len() <= 50) else {
          return Ok(tool_error(
            "Invalid arguments: doc_ids must be an array of at most 50 strings",
          ));
        };
        explicit_empty_doc_ids = arr.is_empty();
        for item in arr {
          let Some(s) = item
            .as_str()
            .map(str::trim)
            .filter(|s| matches!(s.encode_utf16().count(), 1..=128))
          else {
            return Ok(tool_error(
              "Invalid arguments: each doc_ids entry must be 1..=128 characters",
            ));
          };
          doc_ids.push(s.to_owned());
        }
      }
      let limit: u32 = match args.get("limit") {
        None => 10,
        Some(v) => match v.as_u64() {
          Some(n) if (1..=20).contains(&n) => n as u32,
          _ => {
            return Ok(tool_error(
              "Invalid arguments: limit must be an integer between 1 and 20",
            ));
          }
        },
      };
      if explicit_empty_doc_ids {
        return Ok(tool_text(
          json!({ "retrieval_mode": "lexical", "degraded_reason": "VECTOR_UNAVAILABLE", "hits": [] }).to_string(),
        ));
      }
      let candidate_limit = (limit * 3).max(20);
      let fields: Vec<String> = BLOCK_SEARCH_FIELDS.split_whitespace().map(str::to_owned).collect();
      let highlights = vec![SearchHighlight {
        field: "content".to_owned(),
        before: "<b>".to_owned(),
        end: "</b>".to_owned(),
      }];
      let page_lim = |l| SearchPagination {
        limit: Some(l),
        ..Default::default()
      };
      let agg_req = AggregateRequest {
        table: SearchTable::Block,
        query: build_scoped_search_query("content", query_str, &doc_ids, true),
        field: "doc_id".to_owned(),
        options: AggregateOptions {
          hits: AggregateHitsOptions {
            fields: fields.clone(),
            highlights: highlights.clone(),
            pagination: page_lim(2),
          },
          pagination: page_lim(candidate_limit),
        },
      };
      let block_nodes: Result<Vec<Value>, SearchError> = match state
        .app
        .search
        .aggregate_authorized(user_id, workspace_id, agg_req)
        .await
      {
        Ok(agg) => Ok(select_aggregate_bucket_nodes(&agg)),
        Err(SearchError::UnsupportedQuery) => state
          .app
          .search
          .search_authorized(
            user_id,
            workspace_id,
            SearchRequest {
              table: SearchTable::Block,
              query: build_scoped_search_query("content", query_str, &doc_ids, false),
              options: SearchOptions {
                fields,
                highlights,
                pagination: page_lim((candidate_limit.max(1) * 4).min(10_000)),
              },
            },
          )
          .await
          .map(|v| select_fallback_search_nodes(&v, candidate_limit as usize)),
        Err(err) => Err(err),
      };
      let lexical_hits: Result<Vec<(String, String, Value)>, ()> = async {
        let raw_nodes = block_nodes.map_err(|_| ())?;
        let mut missing_ids = Vec::new();
        let mut missing_set = HashSet::new();
        for n in &raw_nodes {
          if inline_page_title(n).is_none()
            && let Some(d) = search_node_non_empty(n, "doc_id")
            && missing_set.insert(d)
          {
            missing_ids.push(d.to_owned());
          }
        }
        let page_titles = mcp_svc
          .load_page_titles(workspace_id, &missing_ids)
          .await
          .map_err(|_| ())?;
        let mut out = Vec::new();
        let mut seen_keys = HashSet::new();
        for (idx, node) in raw_nodes.into_iter().enumerate() {
          if !has_projection_metadata(&node) {
            continue;
          }
          let Some(doc_id) = search_node_non_empty(&node, "doc_id").map(str::to_owned) else {
            continue;
          };
          let unit_id = search_node_non_empty(&node, "unit_id")
            .map(str::to_owned)
            .unwrap_or_else(|| format!("lex-{idx}"));
          let dedupe_key = format!("{doc_id}:{unit_id}");
          if !seen_keys.insert(dedupe_key) {
            continue;
          }
          let title = inline_page_title(&node)
            .map(str::to_owned)
            .or_else(|| page_titles.get(&doc_id).cloned())
            .unwrap_or_default();
          let excerpt = node
            .pointer("/highlights/content/0")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
          let visibility = search_node_non_empty(&node, "visibility").unwrap_or("page").to_owned();
          let block_id = search_node_non_empty(&node, "source_block_id")
            .or_else(|| search_node_non_empty(&node, "block_id"))
            .map(str::to_owned);
          let element_id = search_node_non_empty(&node, "element_id").map(str::to_owned);
          let frame_id = search_node_non_empty(&node, "frame_id").map(str::to_owned);
          let mut obj = Map::from_iter([
            ("doc_id".to_owned(), json!(doc_id)),
            ("title".to_owned(), json!(title)),
            ("excerpt".to_owned(), json!(excerpt)),
            ("visibility".to_owned(), json!(visibility)),
          ]);
          for (k, v) in [
            ("block_id", block_id),
            ("element_id", element_id),
            ("frame_id", frame_id),
          ] {
            if let Some(val) = v {
              obj.insert(k.to_owned(), json!(val));
            }
          }
          out.push((doc_id, unit_id, Value::Object(obj)));
        }
        Ok(out)
      }
      .await;
      let embedding_spi = state.app.extension.copilot_embedding_spi();
      let vector_hits: Option<Vec<server_spi::VectorDocSearchHit>> = if embedding_spi.is_enabled() {
        embedding_spi
          .search_workspace_docs_vector(workspace_id, query_str, &doc_ids, candidate_limit)
          .await
          .ok()
          .flatten()
      } else {
        None
      };

      let doc_id_filter: Option<HashSet<&str>> =
        (!doc_ids.is_empty()).then(|| doc_ids.iter().map(String::as_str).collect());
      let filter_vector_hits = |raw: Vec<server_spi::VectorDocSearchHit>| async move {
        let mut authorized = Vec::new();
        for hit in raw {
          if is_reserved_doc_id(workspace_id, &hit.doc_id) {
            continue;
          }
          if let Some(ref allowed) = doc_id_filter
            && !allowed.contains(hit.doc_id.as_str())
          {
            continue;
          }
          if matches!(
            check_doc_perm(state, workspace_id, user_id, &hit.doc_id, false).await,
            Ok(true)
          ) {
            authorized.push(hit);
          }
        }
        let missing_ids: Vec<String> = authorized
          .iter()
          .filter(|h| h.title.as_deref().is_none_or(|t| t.trim().is_empty()))
          .map(|h| h.doc_id.clone())
          .collect::<HashSet<_>>()
          .into_iter()
          .collect();
        let mut titles = if missing_ids.is_empty() {
          HashMap::new()
        } else {
          mcp_svc
            .load_page_titles(workspace_id, &missing_ids)
            .await
            .unwrap_or_default()
        };
        let mut out = Vec::with_capacity(authorized.len());
        for (idx, vh) in authorized.into_iter().enumerate() {
          let title = vh
            .title
            .filter(|t| !t.trim().is_empty())
            .or_else(|| titles.get(&vh.doc_id).cloned())
            .unwrap_or_default();
          let visibility = if vh.visibility.trim().is_empty() {
            "page".to_owned()
          } else {
            vh.visibility
          };
          let unit_id = if vh.unit_id.trim().is_empty() {
            format!("vec-{idx}")
          } else {
            vh.unit_id
          };
          let mut obj = Map::from_iter([
            ("doc_id".to_owned(), json!(vh.doc_id)),
            ("title".to_owned(), json!(title)),
            ("excerpt".to_owned(), json!(vh.excerpt)),
            ("visibility".to_owned(), json!(visibility)),
          ]);
          for (k, v) in [
            ("block_id", vh.block_id),
            ("element_id", vh.element_id),
            ("frame_id", vh.frame_id),
          ] {
            if let Some(val) = v {
              obj.insert(k.to_owned(), json!(val));
            }
          }
          out.push((vh.doc_id, unit_id, Value::Object(obj)));
        }
        let _ = titles.drain();
        out
      };
      let cap_per_doc = |items: Vec<(String, Value)>, max_total: usize| -> Vec<Value> {
        let mut counts: HashMap<String, usize> = HashMap::new();
        let mut out = Vec::new();
        for (doc_id, val) in items {
          let entry = counts.entry(doc_id).or_insert(0);
          if *entry >= 3 {
            continue;
          }
          *entry += 1;
          out.push(val);
          if out.len() >= max_total {
            break;
          }
        }
        out
      };

      match (lexical_hits, vector_hits) {
        (Ok(lex_hits), Some(vec_hits)) => {
          let authorized_vec = filter_vector_hits(vec_hits).await;
          let mut fused: HashMap<String, (f64, String, String, Value)> = HashMap::new();
          for (idx, (doc_id, unit_id, h)) in lex_hits.into_iter().enumerate() {
            let key = format!("{doc_id}:{unit_id}");
            let rrf = 1.0 / (60.0 + (idx + 1) as f64);
            fused.insert(key, (rrf, unit_id, doc_id, h));
          }
          for (idx, (doc_id, unit_id, vh)) in authorized_vec.into_iter().enumerate() {
            let key = format!("{doc_id}:{unit_id}");
            let rrf = 1.0 / (60.0 + (idx + 1) as f64);
            fused
              .entry(key)
              .and_modify(|(score, _, _, _)| *score += rrf)
              .or_insert((rrf, unit_id, doc_id, vh));
          }
          let mut items: Vec<(f64, String, String, Value)> = fused.into_values().collect();
          items.sort_by(|a, b| b.0.total_cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
          let hits = cap_per_doc(items.into_iter().map(|(_, _, d, v)| (d, v)).collect(), limit as usize);
          Ok(tool_text(
            json!({ "retrieval_mode": "hybrid", "hits": hits }).to_string(),
          ))
        }
        (Err(()), Some(vec_hits)) => {
          let authorized_vec = filter_vector_hits(vec_hits).await;
          let hits = cap_per_doc(
            authorized_vec.into_iter().map(|(d, _, v)| (d, v)).collect(),
            limit as usize,
          );
          Ok(tool_text(
            json!({
              "retrieval_mode": "vector",
              "degraded_reason": "LEXICAL_UNAVAILABLE",
              "hits": hits
            })
            .to_string(),
          ))
        }
        (Ok(lex_hits), None) => {
          let hits = cap_per_doc(lex_hits.into_iter().map(|(d, _, v)| (d, v)).collect(), limit as usize);
          Ok(tool_text(
            json!({ "retrieval_mode": "lexical", "degraded_reason": "VECTOR_UNAVAILABLE", "hits": hits }).to_string(),
          ))
        }
        (Err(()), None) => {
          if doc_ids.is_empty() {
            return Ok(tool_error("SEARCH_UNAVAILABLE"));
          }
          let mut seen_ids = HashSet::new();
          let mut readable = Vec::new();
          for did in &doc_ids {
            if !seen_ids.insert(did.as_str()) || is_reserved_doc_id(workspace_id, did) {
              continue;
            }
            if matches!(check_doc_perm(state, workspace_id, user_id, did, false).await, Ok(true)) {
              readable.push(did.clone());
              if readable.len() >= limit as usize {
                break;
              }
            }
          }
          let max_utf16_units = 20_000 / readable.len().max(1);
          let mut scoped_hits = Vec::with_capacity(readable.len());
          for did in readable {
            let Ok(Some((title, md))) = mcp_svc.read_document_title_and_markdown(workspace_id, &did).await else {
              return Ok(tool_error("SEARCH_UNAVAILABLE"));
            };
            scoped_hits.push(json!({
              "doc_id": did,
              "title": title.unwrap_or_default(),
              "excerpt": truncate_utf16(&md, max_utf16_units),
              "visibility": "page",
            }));
          }
          Ok(tool_text(
            json!({ "retrieval_mode": "scoped", "degraded_reason": "SEARCH_UNAVAILABLE", "hits": scoped_hits })
              .to_string(),
          ))
        }
      }
    }
    "create_document" => {
      if !can_create_doc {
        return Ok(tool_error(
          "Failed to create document: Workspace.CreateDoc permission required",
        ));
      }
      let Some(raw_title) = args.get("title").and_then(Value::as_str) else {
        return Ok(tool_error("Invalid arguments: title: Required"));
      };
      let Some(content) = args.get("content").and_then(Value::as_str) else {
        return Ok(tool_error("Invalid arguments: content: Required"));
      };
      let sanitized_title: String = raw_title.replace(['\r', '\n'], " ").trim().to_owned();
      if sanitized_title.is_empty() {
        return Ok(tool_error("Failed to create document: Title cannot be empty"));
      }
      let explicit_doc_id = match args.get("docId") {
        None => None,
        Some(Value::String(raw)) => {
          let trimmed = raw.trim();
          if trimmed.is_empty() {
            return Ok(tool_error("Invalid arguments: docId cannot be empty"));
          }
          Some(trimmed)
        }
        Some(_) => return Ok(tool_error("Invalid arguments: docId must be a string")),
      };
      if let Some(doc_id) = explicit_doc_id {
        if is_reserved_doc_id(workspace_id, doc_id) {
          return Ok(tool_error("Failed to create document: Invalid document ID."));
        }
        match check_doc_perm(state, workspace_id, user_id, doc_id, true).await {
          Ok(true) => {}
          Ok(false) => {
            return Ok(tool_error(format!(
              "Failed to create document: Doc.Update permission required for {doc_id}"
            )));
          }
          Err(e) => return Ok(e),
        }
      }
      Ok(match mcp_svc
        .create_document(workspace_id, &sanitized_title, content, user_id, explicit_doc_id)
        .await
      {
        Ok(doc_id) => tool_text(
          json!({ "success": true, "docId": doc_id, "message": format!("Document \"{raw_title}\" created successfully") })
            .to_string(),
        ),
        Err(e) => map_doc_write_err("create document", e),
      })
    }
    "update_document" => {
      let (Some(doc_id), Some(content)) = (
        args.get("docId").and_then(Value::as_str),
        args.get("content").and_then(Value::as_str),
      ) else {
        return Ok(tool_error("Invalid arguments: docId and content required"));
      };
      if let Err(e) = require_doc_perm(state, workspace_id, user_id, doc_id, true).await {
        return Ok(e);
      }
      Ok(
        match mcp_svc.update_document(workspace_id, doc_id, content, user_id).await {
          Ok(true) => tool_text(
            json!({ "success": true, "docId": doc_id, "message": "Document updated successfully" }).to_string(),
          ),
          Ok(false) => tool_error(format!("Doc with id {doc_id} not found.")),
          Err(e) => map_doc_write_err("update document", e),
        },
      )
    }
    "update_document_meta" => {
      let (Some(doc_id), Some(raw_title)) = (
        args.get("docId").and_then(Value::as_str),
        args.get("title").and_then(Value::as_str),
      ) else {
        return Ok(tool_error("Invalid arguments: docId and title required"));
      };
      if let Err(e) = require_doc_perm(state, workspace_id, user_id, doc_id, true).await {
        return Ok(e);
      }
      let sanitized_title: String = raw_title.replace(['\r', '\n'], " ").trim().to_owned();
      if sanitized_title.is_empty() {
        return Ok(tool_error(format!("Doc with id {doc_id} not found.")));
      }
      Ok(
        match mcp_svc
          .update_document_title(workspace_id, doc_id, &sanitized_title, user_id)
          .await
        {
          Ok(true) => tool_text(
            json!({ "success": true, "docId": doc_id, "message": "Document title updated successfully" }).to_string(),
          ),
          Ok(false) => tool_error(format!("Doc with id {doc_id} not found.")),
          Err(e) => map_doc_write_err("update document metadata", e),
        },
      )
    }
    _ => Ok(tool_error(format!("Tool not found: {tool_name}"))),
  }
}
