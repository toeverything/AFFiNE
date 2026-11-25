//! Request-level rate limiter matching `v0.27.5` `base/throttler/{config,index}.ts`
//! (Redis Hash Lua + bounded in-memory fallback).
use super::{RequestPrincipal, envelope_to_http_response};
use crate::RouterState;
use crate::legacy_compat::errors::LegacyErrorEnvelope;
use axum::extract::{ConnectInfo, FromRequestParts};
use axum::http::request::Parts;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::Response;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};
pub(crate) struct PeerAddr(pub Option<SocketAddr>);
impl<S: Send + Sync> FromRequestParts<S> for PeerAddr {
  type Rejection = std::convert::Infallible;
  async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
    Ok(Self(parts.extensions.get::<ConnectInfo<SocketAddr>>().map(|c| c.0)))
  }
}
const DEFAULT_TTL_MS: u64 = 60_000;
const DEFAULT_LIMIT: u64 = 120;
const DEFAULT_STRICT_LIMIT: u64 = 20;
const FALLBACK_MAX_ENTRIES: usize = 4096;
const REDIS_CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
const REDIS_THROTTLE_LUA: &str = "\
local k,ttl,lim,bd=KEYS[1],tonumber(ARGV[1]),tonumber(ARGV[2]),tonumber(ARGV[3]);\
local t=redis.call('TIME');local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000);\
local bu=tonumber(redis.call('HGET',k,'blockedUntil') or '0');\
if bu>now then return {tonumber(redis.call('HGET',k,'hits') or '0'),redis.call('PTTL',k),bu-now} end;\
if bu>0 then redis.call('HDEL',k,'blockedUntil');redis.call('HSET',k,'hits',0) end;\
local h=redis.call('HINCRBY',k,'hits',1);if h==1 then redis.call('PEXPIRE',k,ttl) end;\
local p=redis.call('PTTL',k);if p<0 then redis.call('PEXPIRE',k,ttl);p=ttl end;\
if h>lim then redis.call('HSET',k,'blockedUntil',now+bd);if p<bd then redis.call('PEXPIRE',k,bd);p=bd end;return {h,p,bd} end;\
return {h,p,0}";
type FallbackMap = HashMap<String, (u64, Instant, Option<Instant>)>;
#[derive(Default)]
pub struct StrictThrottler {
  fallback: Mutex<FallbackMap>,
  redis_conn: tokio::sync::Mutex<Option<redis::aio::MultiplexedConnection>>,
}
#[derive(Clone, Copy, Debug)]
pub struct ThrottleHeaders {
  pub limit: u64,
  pub remaining: u64,
  pub reset_secs: u64,
}
impl ThrottleHeaders {
  pub fn apply_to(self, headers: &mut HeaderMap) {
    for (name, val) in [
      ("x-ratelimit-limit", self.limit),
      ("x-ratelimit-remaining", self.remaining),
      ("x-ratelimit-reset", self.reset_secs),
    ] {
      if let Ok(v) = HeaderValue::from_str(&val.to_string()) {
        headers.insert(name, v);
      }
    }
  }
}
#[derive(Clone, Copy, Debug)]
pub enum ThrottleOutcome {
  Disabled,
  Allowed(ThrottleHeaders),
  Limited { retry_after_secs: u64 },
}
#[derive(Clone, Copy)]
pub(crate) enum ThrottleSpec {
  Default,
  Strict,
  DefaultCustom {
    handler: &'static str,
    limit: u64,
    ttl_ms: Option<u64>,
  },
}
pub fn too_many_requests_envelope() -> LegacyErrorEnvelope {
  LegacyErrorEnvelope {
    status: StatusCode::TOO_MANY_REQUESTS.as_u16(),
    code: "Too Many Requests".into(),
    error_type: "TOO_MANY_REQUESTS".into(),
    name: "TOO_MANY_REQUEST".into(),
    message: "Too many requests.".into(),
    data: None,
  }
}
pub fn resolve_throttle_tracker(
  headers: Option<&HeaderMap>,
  peer_addr: Option<SocketAddr>,
  session_id: Option<&str>,
) -> String {
  let raw = if let Some(sid) = session_id.map(str::trim).filter(|s| !s.is_empty()) {
    sid.to_owned()
  } else if let Some(h) = headers {
    let hdr = |n: &str| {
      h.get(n)
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    };
    hdr("cf-connecting-ip")
      .or_else(|| {
        hdr("x-forwarded-for")
          .and_then(|r| r.split(',').next())
          .map(str::trim)
          .filter(|s| !s.is_empty())
      })
      .or_else(|| hdr("x-real-ip"))
      .or_else(|| hdr("cf-ray"))
      .map(str::to_owned)
      .unwrap_or_else(|| peer_addr.map(|a| a.ip().to_string()).unwrap_or_default())
  } else {
    peer_addr.map(|a| a.ip().to_string()).unwrap_or_default()
  };
  if raw.len() > 256 {
    format!("sha256:{}", server_domain::auth::token_hash(&raw))
  } else {
    raw
  }
}
impl StrictThrottler {
  pub fn new() -> Self {
    Self::default()
  }
  fn check_memory(&self, key: &str, ttl_ms: u64, limit: u64, block_ms: u64) -> (u64, u64, u64) {
    let now = Instant::now();
    let (ttl, bdur) = (
      Duration::from_millis(ttl_ms.max(1)),
      Duration::from_millis(block_ms.max(1)),
    );
    let Ok(mut map) = self.fallback.lock() else {
      return (1, ttl_ms.max(1), 0);
    };
    let eff = |(_, exp, bu): &(u64, Instant, Option<Instant>)| bu.map_or(*exp, |b| b.max(*exp));
    if map.len() >= FALLBACK_MAX_ENTRIES {
      map.retain(|_, v| eff(v) > now);
      if map.len() >= FALLBACK_MAX_ENTRIES
        && let Some(old) = map.iter().min_by_key(|(_, v)| eff(v)).map(|(k, _)| k.clone())
      {
        map.remove(&old);
      }
    }
    let e = map.entry(key.to_owned()).or_insert((0, now + ttl, None));
    let rem_ms = |t: Instant| (t.saturating_duration_since(now).as_millis() as u64).max(1);
    if e.2.is_some_and(|bu| bu > now) {
      return (e.0, rem_ms(e.1), rem_ms(e.2.unwrap()));
    }
    if e.2.is_some() || e.1 <= now {
      *e = (0, now + ttl, None);
    }
    e.0 = e.0.saturating_add(1);
    if e.0 == 1 {
      e.1 = now + ttl;
    }
    let mut pttl = rem_ms(e.1);
    if e.0 > limit {
      let bu = now + bdur;
      e.2 = Some(bu);
      if e.1 < bu {
        e.1 = bu;
        pttl = block_ms.max(1);
      }
      return (e.0, pttl, block_ms.max(1));
    }
    (e.0, pttl, 0)
  }
  async fn get_or_connect_redis(&self, client: &redis::Client) -> Option<redis::aio::MultiplexedConnection> {
    let mut guard = self.redis_conn.lock().await;
    if let Some(conn) = guard.as_ref() {
      return Some(conn.clone());
    }
    if let Ok(Ok(conn)) = tokio::time::timeout(REDIS_CONNECT_TIMEOUT, client.get_multiplexed_async_connection()).await {
      *guard = Some(conn.clone());
      return Some(conn);
    }
    None
  }
  async fn increment(&self, redis: Option<&redis::Client>, key: &str, ttl_ms: u64, limit: u64) -> (u64, u64, u64) {
    let block_ms = ttl_ms.max(1);
    if let Some(client) = redis
      && let Some(mut conn) = self.get_or_connect_redis(client).await
    {
      match redis::Script::new(REDIS_THROTTLE_LUA)
        .key(key)
        .arg(ttl_ms)
        .arg(limit)
        .arg(block_ms)
        .invoke_async::<(u64, i64, i64)>(&mut conn)
        .await
      {
        Ok((hits, pttl, bttl)) => return (hits, pttl.max(1) as u64, bttl.max(0) as u64),
        Err(_) => *self.redis_conn.lock().await = None,
      }
    }
    self.check_memory(key, ttl_ms, limit, block_ms)
  }
}
pub(crate) async fn check_throttle_for_app(
  app: &crate::AppState,
  headers: Option<&HeaderMap>,
  peer_addr: Option<SocketAddr>,
  session_id: Option<&str>,
  spec: ThrottleSpec,
) -> ThrottleOutcome {
  let effective = app.app_config.get_effective_app_config().await.ok();
  let get_u64 = |ptr: &str, def: u64| {
    effective
      .as_ref()
      .and_then(|v| v.pointer(ptr).and_then(serde_json::Value::as_u64))
      .unwrap_or(def)
      .max(1)
  };
  if !effective
    .as_ref()
    .and_then(|v| v.pointer("/throttle/enabled").and_then(serde_json::Value::as_bool))
    .unwrap_or(true)
  {
    return ThrottleOutcome::Disabled;
  }
  let tracker = resolve_throttle_tracker(headers, peer_addr, session_id);
  let (key, limit, ttl_ms) = match spec {
    ThrottleSpec::Default => (
      format!("throttler:{tracker};default"),
      get_u64("/throttle/throttlers/default/limit", DEFAULT_LIMIT),
      get_u64("/throttle/throttlers/default/ttl", DEFAULT_TTL_MS),
    ),
    ThrottleSpec::Strict => (
      format!("throttler:{tracker};strict"),
      get_u64("/throttle/throttlers/strict/limit", DEFAULT_STRICT_LIMIT),
      get_u64("/throttle/throttlers/strict/ttl", DEFAULT_TTL_MS),
    ),
    ThrottleSpec::DefaultCustom { handler, limit, ttl_ms } => {
      let def_lim = get_u64("/throttle/throttlers/default/limit", DEFAULT_LIMIT);
      let def_ttl = get_u64("/throttle/throttlers/default/ttl", DEFAULT_TTL_MS);
      let eff_ttl = ttl_ms.unwrap_or(def_ttl).max(1);
      let key = if limit != def_lim || eff_ttl != def_ttl {
        format!("throttler:{tracker};custom;default:AuthController.{handler}")
      } else {
        format!("throttler:{tracker};default")
      };
      (key, limit.max(1), eff_ttl)
    }
  };
  let (hits, pttl_ms, block_ttl_ms) = app
    .strict_throttler
    .increment(app.redis.as_ref(), &key, ttl_ms, limit)
    .await;
  if block_ttl_ms > 0 || hits > limit {
    let retry_after_secs = if block_ttl_ms > 0 { block_ttl_ms } else { ttl_ms }
      .div_ceil(1000)
      .max(1);
    ThrottleOutcome::Limited { retry_after_secs }
  } else {
    ThrottleOutcome::Allowed(ThrottleHeaders {
      limit,
      remaining: limit.saturating_sub(hits),
      reset_secs: pttl_ms.div_ceil(1000).max(1),
    })
  }
}
pub(crate) fn apply_throttle(headers: &mut HeaderMap, throttle: Option<ThrottleHeaders>) {
  if let Some(h) = throttle {
    h.apply_to(headers);
  }
}
pub(crate) async fn enforce_throttle_http(
  state: &RouterState,
  headers: &HeaderMap,
  peer_addr: Option<SocketAddr>,
  principal: Option<&RequestPrincipal>,
  spec: ThrottleSpec,
) -> Result<Option<ThrottleHeaders>, Box<Response>> {
  let sid = match principal {
    Some(RequestPrincipal::Cookie { session_id, .. } | RequestPrincipal::Bearer { session_id, .. }) => {
      Some(session_id.as_str())
    }
    None => None,
  };
  match check_throttle_for_app(&state.app, Some(headers), peer_addr, sid, spec).await {
    ThrottleOutcome::Disabled => Ok(None),
    ThrottleOutcome::Allowed(h) => Ok(Some(h)),
    ThrottleOutcome::Limited { retry_after_secs } => {
      let mut resp = envelope_to_http_response(too_many_requests_envelope());
      if let Ok(v) = HeaderValue::from_str(&retry_after_secs.to_string()) {
        resp.headers_mut().insert(header::RETRY_AFTER, v);
      }
      Err(Box::new(resp))
    }
  }
}
