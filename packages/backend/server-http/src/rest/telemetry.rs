//! Telemetry collection REST routes (`OPTIONS`/`POST /api/telemetry/collect`).

use std::collections::{BTreeMap, HashMap, VecDeque};
use std::net::SocketAddr;
use std::time::{Duration, Instant};

use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Extension, Router};
use chrono::Utc;
use reqwest::Method;
use serde_json::{Map, Value, json};
use server_domain::safe_fetch::{SafeFetchPolicy, SafeFetchRequest, safe_fetch};
use sha2::{Digest as _, Sha256};
use url::Url;

use crate::RouterState;
use crate::rest::worker_proxy::{
  allowed_origins_for_state, append_cors_origin, apply_throttle_headers, bad_request_envelope, check_shared_throttle,
};
use crate::rest::{ResolvedRequestPrincipal, enforce_named_version_guard, resolve_request_principal_with_policy};

const MAX_PARAM_VALUE_CHARS: usize = 100;
const PRIORITY_KEYS: &str = "event_id session_id session_number engagement_time_msec ui_page ui_segment ui_module \
  ui_control ui_option ui_arg type method mode plan_name billing_cycle role result error_code category doc_type item \
  action target enabled setting_key setting_value duration_ms doc_count unread_count with_attachment with_mention \
  page_location page_path page_referrer page_title";
const PARAM_RENAMES: &str = "page=ui_page segment=ui_segment module=ui_module arg=ui_arg control=ui_control \
  option=ui_option key=setting_key value=setting_value docId=doc_id workspaceId=workspace_id serverId=server_id \
  docType=doc_type docCount=doc_count unreadCount=unread_count withAttachment=with_attachment withMention=with_mention \
  appName=app_name recurring=billing_cycle plan=plan_name time=duration_ms error=error_code status=result \
  success=result to=target on=enabled pageLocation=page_location pageReferrer=page_referrer pagePath=page_path \
  pageTitle=page_title";
const USER_PROP_RENAMES: &str = "appVersion=app_version editorVersion=editor_version environment=environment \
  isDesktop=is_desktop isMobile=is_mobile distribution=distribution isSelfHosted=is_self_hosted ai=ai_enabled \
  pro=plan_tier quota=quota_tier";

pub(crate) fn router() -> Router<RouterState> {
  Router::new().route(
    "/api/telemetry/collect",
    post(handle_collect).options(handle_collect_options),
  )
}
pub struct TelemetryDeduper {
  ttl: Duration,
  max_entries: usize,
  entries: HashMap<[u8; 32], Instant>,
  order: VecDeque<([u8; 32], Instant)>,
}
impl TelemetryDeduper {
  pub fn new(ttl: Duration, max_entries: usize) -> Self {
    Self {
      ttl,
      max_entries: max_entries.max(1),
      entries: HashMap::new(),
      order: VecDeque::new(),
    }
  }
  pub fn is_duplicate(&mut self, key: &str) -> bool {
    let (digest, now): ([u8; 32], Instant) = (Sha256::digest(key.as_bytes()).into(), Instant::now());
    while self
      .order
      .front()
      .is_some_and(|&(_, ts)| now.duration_since(ts) >= self.ttl)
    {
      if let Some((fk, ts)) = self.order.pop_front()
        && self.entries.get(&fk) == Some(&ts)
      {
        self.entries.remove(&fk);
      }
    }
    if self
      .entries
      .get(&digest)
      .is_some_and(|&ts| now.duration_since(ts) < self.ttl)
    {
      return true;
    }
    while self.entries.len() >= self.max_entries
      && let Some((ok, ots)) = self.order.pop_front()
    {
      if self.entries.get(&ok) == Some(&ots) {
        self.entries.remove(&ok);
      }
    }
    self.entries.insert(digest, now);
    self.order.push_back((digest, now));
    false
  }
}
struct CleanedTelemetryEvent {
  client_id: String,
  user_id: Option<String>,
  event_id: String,
  event_name: String,
  timestamp_micros: i64,
  params: Map<String, Value>,
  user_properties: BTreeMap<String, String>,
}
fn lookup_rename<'a>(spec: &'static str, key: &'a str) -> &'a str {
  spec
    .split_ascii_whitespace()
    .find_map(|p| p.split_once('=').and_then(|(k, v)| (k == key).then_some(v)))
    .unwrap_or(key)
}
fn to_snake_case(input: &str) -> String {
  let chars: Vec<char> = input.chars().collect();
  let mut out = String::with_capacity(input.len() + 4);
  for (i, &c) in chars.iter().enumerate() {
    let mut push = |ch: char| {
      if ch != '_' || !out.ends_with('_') {
        out.push(ch);
      }
    };
    if c.is_ascii_uppercase() {
      let is_ld = |ch: char| ch.is_ascii_lowercase() || ch.is_ascii_digit();
      if i > 0
        && (is_ld(chars[i - 1]) || (chars[i - 1].is_ascii_uppercase() && chars.get(i + 1).is_some_and(|&n| is_ld(n))))
      {
        push('_');
      }
      push(c.to_ascii_lowercase());
    } else {
      push(if c.is_ascii_alphanumeric() { c } else { '_' });
    }
  }
  out
}
fn is_valid_ident(name: &str, max_len: usize) -> bool {
  let b = name.as_bytes();
  !b.is_empty()
    && b.len() <= max_len
    && b[0].is_ascii_alphabetic()
    && b.iter().all(|c| c.is_ascii_alphanumeric() || *c == b'_')
}
fn trunc(s: &str, max: usize) -> String {
  s.chars().take(max).collect()
}
fn to_scalar(v: &Value) -> Option<Value> {
  match v {
    Value::Null => None,
    Value::Number(n) => Some(Value::Number(n.clone())),
    Value::Bool(b) => Some(json!(i32::from(*b))),
    Value::String(s) => Some(Value::String(trunc(s, MAX_PARAM_VALUE_CHARS))),
    other => serde_json::to_string(other)
      .ok()
      .map(|s| Value::String(trunc(&s, MAX_PARAM_VALUE_CHARS))),
  }
}
fn flatten_object(
  m: &Map<String, Value>,
  pfx: &str,
  d: usize,
  vis: &mut usize,
  max: usize,
  out: &mut Vec<(String, Value)>,
) {
  if d >= 6 || out.len() >= max || *vis >= 128 {
    return;
  }
  for (k, v) in m {
    if out.len() >= max || *vis >= 128 {
      break;
    }
    *vis += 1;
    let path = if pfx.is_empty() {
      k.clone()
    } else {
      format!("{pfx}.{k}")
    };
    if k.is_empty() || path.len() > 40 || matches!(k.as_str(), "other" | "instruction" | "operation") {
      continue;
    }
    if let Some(nested) = v.as_object() {
      flatten_object(nested, &path, d + 1, vis, max, out);
    } else {
      out.push((path, v.clone()));
    }
  }
}
pub fn sanitize_params(input: &Map<String, Value>, max_params: usize) -> Map<String, Value> {
  let (mut flat, mut visited) = (Vec::new(), 0usize);
  flatten_object(input, "", 0, &mut visited, max_params.min(25), &mut flat);
  let mut mapped: Vec<(String, Value)> = flat
    .into_iter()
    .filter_map(|(path, value)| {
      if path
        .split('.')
        .any(|s| matches!(s, "other" | "instruction" | "operation"))
      {
        return None;
      }
      let key = to_snake_case(
        &path
          .split('.')
          .map(|s| lookup_rename(PARAM_RENAMES, s))
          .collect::<Vec<_>>()
          .join("_"),
      );
      if !is_valid_ident(&key, 40) || matches!(key.as_str(), "doc_id" | "workspace_id" | "server_id") {
        return None;
      }
      let norm = match (key.as_str(), value.as_bool()) {
        ("result", Some(b)) => Some(Value::String(if b { "success" } else { "failure" }.into())),
        ("enabled", Some(b)) => Some(Value::String(if b { "on" } else { "off" }.into())),
        _ => to_scalar(&value),
      }?;
      Some((key, norm))
    })
    .collect();
  mapped.sort_by_key(|(k, _)| usize::from(!PRIORITY_KEYS.split_ascii_whitespace().any(|p| p == k)));
  let mut out = Map::new();
  for (k, v) in mapped {
    if out.len() >= max_params {
      break;
    }
    out.entry(k).or_insert(v);
  }
  out
}
fn str_field<'a>(obj: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
  obj.get(key).and_then(Value::as_str).filter(|s| !s.is_empty())
}
fn clean_telemetry_event(
  raw: &Value,
  principal_uid: Option<&str>,
  fallback_micros: i64,
) -> Option<CleanedTelemetryEvent> {
  let obj = raw.as_object()?;
  if obj.get("schemaVersion").and_then(Value::as_i64) != Some(1) {
    return None;
  }
  let client_id = trunc(str_field(obj, "clientId")?, 128);
  let event_id = trunc(str_field(obj, "eventId")?, 128);
  let raw_name = str_field(obj, "eventName")?;
  let event_name = if raw_name == "track_pageview" {
    "page_view".to_owned()
  } else {
    to_snake_case(raw_name)
  };
  if !is_valid_ident(&event_name, 40) {
    return None;
  }
  let mut mp = obj
    .get("params")
    .and_then(Value::as_object)
    .cloned()
    .unwrap_or_default();
  let (mut mup, ctx) = (Map::new(), obj.get("context").and_then(Value::as_object));
  let ctx_url = ctx.and_then(|c| str_field(c, "url"));
  if let Some(c) = ctx {
    for (s, d) in [
      ("url", "pageLocation"),
      ("referrer", "pageReferrer"),
      ("locale", "locale"),
      ("timezone", "timezone"),
      ("channel", "channel"),
    ] {
      if let Some(v) = str_field(c, s) {
        mp.insert(d.into(), json!(v));
      }
    }
    for k in "appVersion editorVersion environment distribution isDesktop isMobile".split(' ') {
      if let Some(v) = c.get(k).filter(|v| !v.is_null()) {
        mup.insert(k.into(), v.clone());
      }
    }
  }
  mp.insert("eventId".into(), json!(&event_id));
  if let Some(sid) = match obj.get("sessionId") {
    Some(Value::String(s)) if !s.is_empty() => Some(s.clone()),
    Some(Value::Number(n)) => Some(n.to_string()),
    _ => None,
  } {
    mp.insert("sessionId".into(), Value::String(sid));
  }
  if let Some(bp) = obj.get("userProperties").and_then(Value::as_object) {
    mup.extend(bp.clone());
  }
  let mut user_properties = BTreeMap::new();
  for (key, value) in &mup {
    let mk = to_snake_case(lookup_rename(USER_PROP_RENAMES, key));
    if key.starts_with('$') || !is_valid_ident(&mk, 24) {
      continue;
    }
    let scalar = match (key.as_str(), value.as_bool()) {
      ("pro", Some(b)) => Some(Value::String(if b { "pro" } else { "free" }.into())),
      _ => to_scalar(value),
    };
    if let Some(v) = scalar {
      let s = v.as_str().map(str::to_owned).unwrap_or_else(|| v.to_string());
      user_properties.insert(mk, trunc(&s, 36));
    }
  }
  let mut params = if event_name == "page_view" {
    let (raw_loc, raw_title) = (
      mp.remove("location"),
      mp.remove("title").or_else(|| mp.remove("pageTitle")),
    );
    let mut page_loc = raw_loc.as_ref().and_then(Value::as_str).or(ctx_url).map(str::to_owned);
    let mut page_path = None;
    if let Some(loc) = page_loc.as_deref() {
      if let Some(u) = ctx_url
        .and_then(|b| Url::parse(b).ok()?.join(loc).ok())
        .or_else(|| Url::parse(loc).ok())
      {
        page_path = Some(
          u.query()
            .map_or_else(|| u.path().to_owned(), |q| format!("{}?{q}", u.path())),
        );
        if !loc.starts_with("http") {
          page_loc = Some(u.to_string());
        }
      } else if loc.starts_with('/') {
        page_path = Some(loc.to_owned());
      }
    }
    let mut out = sanitize_params(&mp, 22);
    for (k, v) in [
      ("page_location", page_loc.as_deref()),
      ("page_path", page_path.as_deref()),
      ("page_title", raw_title.as_ref().and_then(Value::as_str)),
    ] {
      if let Some(s) = v {
        out.insert(k.into(), Value::String(trunc(s, MAX_PARAM_VALUE_CHARS)));
      }
    }
    out
  } else {
    sanitize_params(&mp, 25)
  };
  if params.is_empty() {
    params.insert("event_id".into(), Value::String(event_id.clone()));
  }
  let user_id = str_field(obj, "userId").or(principal_uid).map(|s| trunc(s, 128));
  let timestamp_micros = obj
    .get("timestampMicros")
    .and_then(Value::as_f64)
    .filter(|v| v.is_finite())
    .map_or(fallback_micros, |v| v as i64);
  Some(CleanedTelemetryEvent {
    client_id,
    user_id,
    event_id,
    event_name,
    timestamp_micros,
    params,
    user_properties,
  })
}
async fn forward_to_ga4_if_configured(state: &RouterState, events: &[CleanedTelemetryEvent]) {
  let Ok(Some(cfg)) = state.app.app_config.get_raw_config_value("telemetry").await else {
    return;
  };
  let ps = |p| cfg.pointer(p).and_then(Value::as_str).unwrap_or("").trim();
  let (mid, secret) = (ps("/ga4/measurementId"), ps("/ga4/apiSecret"));
  let Ok(mut url) = Url::parse("https://www.google-analytics.com/mp/collect") else {
    return;
  };
  if mid.is_empty() || secret.is_empty() {
    return;
  }
  url
    .query_pairs_mut()
    .append_pair("measurement_id", mid)
    .append_pair("api_secret", secret);
  let max_ev = cfg
    .pointer("/batch/maxEvents")
    .and_then(Value::as_u64)
    .map_or(25, |n| usize::try_from(n).unwrap_or(25).clamp(1, 25));
  let mut grouped: BTreeMap<_, Vec<&CleanedTelemetryEvent>> = BTreeMap::new();
  for ev in events {
    grouped
      .entry((&ev.client_id, &ev.user_id, &ev.user_properties))
      .or_default()
      .push(ev);
  }
  let policy = SafeFetchPolicy {
    allow_http: false,
    allowed_hosts: vec!["www.google-analytics.com".into()],
    allow_private_origins: Vec::new(),
    allow_cross_origin_body_replay: false,
    max_redirects: 0,
    connect_timeout: Duration::from_secs(3),
    timeout: Duration::from_secs(10),
    max_response_bytes: 64 * 1024,
  };
  let mut h = reqwest::header::HeaderMap::new();
  h.insert(
    reqwest::header::CONTENT_TYPE,
    reqwest::header::HeaderValue::from_static("application/json"),
  );
  for ((client_id, user_id, user_props), group_events) in grouped {
    for chunk in group_events.chunks(max_ev) {
      let evs = chunk
        .iter()
        .map(|ev| json!({"name": ev.event_name, "params": ev.params, "timestamp_micros": ev.timestamp_micros}))
        .collect();
      let mut body = Map::from_iter([
        ("client_id".into(), json!(client_id)),
        ("events".into(), Value::Array(evs)),
      ]);
      if let Some(uid) = user_id {
        body.insert("user_id".into(), json!(uid));
      }
      if !user_props.is_empty() {
        body.insert(
          "user_properties".into(),
          Value::Object(
            user_props
              .iter()
              .map(|(k, v)| (k.clone(), json!({"value": v})))
              .collect(),
          ),
        );
      }
      let req = SafeFetchRequest {
        method: Method::POST,
        url: url.to_string(),
        headers: h.clone(),
        body: Some(serde_json::to_vec(&body).unwrap_or_default()),
        policy: policy.clone(),
      };
      match safe_fetch(req).await {
        Ok(r) if r.status.is_success() => {}
        Ok(r) => tracing::warn!(status = r.status.as_u16(), "GA4 telemetry chunk failed"),
        Err(_) => tracing::warn!("GA4 telemetry chunk transport failed"),
      }
    }
  }
}
type PeerExt = Option<Extension<ConnectInfo<SocketAddr>>>;
async fn with_telemetry_guard<F, Fut>(st: &RouterState, peer: PeerExt, hdrs: &HeaderMap, is_opt: bool, f: F) -> Response
where
  F: FnOnce(ResolvedRequestPrincipal) -> Fut,
  Fut: std::future::Future<Output = Response>,
{
  let resolved = match resolve_request_principal_with_policy(st, hdrs, true).await {
    Ok(r) => r,
    Err(e) => return e.into_http_response(),
  };
  let sid = resolved.principal.as_ref().map(|p| p.session_id());
  let quota = match check_shared_throttle(st, hdrs, peer.map(|c| c.0.0), sid, None).await {
    Ok(q) => q,
    Err(r) => return *r,
  };
  if let Err(r) = enforce_named_version_guard(st, hdrs, &resolved.cookie_action).await {
    return *r;
  }
  let (allowed, https) = (allowed_origins_for_state(st, true), st.app.config.load().https);
  let (origin, referer) = (
    hdrs.get(header::ORIGIN).and_then(|v| v.to_str().ok()),
    hdrs.get(header::REFERER).and_then(|v| v.to_str().ok()),
  );
  let origin_ok = (origin.is_none() && referer.is_none())
    || origin.is_some_and(|o| allowed.iter().any(|a| a == o))
    || referer
      .and_then(|r| Url::parse(r).ok())
      .is_some_and(|u| allowed.iter().any(|a| a == &u.origin().ascii_serialization()));
  let cookie_action = resolved.cookie_action.clone();
  let mut resp = if !origin_ok {
    let o = origin.unwrap_or("undefined");
    let msg = if is_opt {
      format!("Invalid origin: {o}, referer: {}", referer.unwrap_or("undefined"))
    } else {
      format!("Invalid origin: {o}")
    };
    bad_request_envelope(msg)
  } else {
    let mut r = f(resolved).await;
    append_cors_origin(r.headers_mut(), origin, &allowed);
    r
  };
  apply_throttle_headers(resp.headers_mut(), quota.as_ref());
  cookie_action.apply_to(resp.headers_mut(), https);
  resp
}
async fn handle_collect_options(State(st): State<RouterState>, peer: PeerExt, hdrs: HeaderMap) -> Response {
  with_telemetry_guard(&st, peer, &hdrs, true, |_| async {
    (
      StatusCode::OK,
      [
        (header::ACCESS_CONTROL_ALLOW_METHODS, "POST, OPTIONS"),
        (header::ACCESS_CONTROL_ALLOW_HEADERS, "Content-Type, x-affine-version"),
      ],
    )
      .into_response()
  })
  .await
}
async fn handle_collect(State(st): State<RouterState>, peer: PeerExt, hdrs: HeaderMap, body: bytes::Bytes) -> Response {
  with_telemetry_guard(&st.clone(), peer, &hdrs, false, |resolved| async move {
    let raw_batch = serde_json::from_slice::<Value>(&body).ok();
    let (mut accepted, mut dropped) = (0usize, 0usize);
    if let Some(batch) = raw_batch.as_ref().and_then(Value::as_object)
      && batch.get("schemaVersion").and_then(Value::as_i64) == Some(1)
      && let Some(events) = batch.get("events").and_then(Value::as_array)
    {
      let uid = resolved.principal.as_ref().map(|p| p.user().id.clone());
      let fallback = batch
        .get("sentAt")
        .and_then(Value::as_f64)
        .filter(|v| v.is_finite())
        .map_or_else(|| Utc::now().timestamp_micros(), |v| (v * 1000.0) as i64);
      dropped = events.len().saturating_sub(100);
      let mut accepted_events = Vec::new();
      for raw in events.iter().take(100) {
        let Some(c) = clean_telemetry_event(raw, uid.as_deref(), fallback) else {
          dropped += 1;
          continue;
        };
        let dk = format!("{}:{}", c.client_id, c.event_id);
        if st.app.telemetry_deduper.lock().is_ok_and(|mut d| d.is_duplicate(&dk)) {
          dropped += 1;
        } else {
          accepted_events.push(c);
        }
      }
      accepted = accepted_events.len();
      if !accepted_events.is_empty() {
        forward_to_ga4_if_configured(&st, &accepted_events).await;
      }
    }
    let bytes = serde_json::to_vec(&json!({"ok": true, "accepted": accepted, "dropped": dropped}))
      .unwrap_or_else(|_| b"{\"ok\":true,\"accepted\":0,\"dropped\":0}".to_vec());
    (
      StatusCode::CREATED,
      [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
      bytes,
    )
      .into_response()
  })
  .await
}
