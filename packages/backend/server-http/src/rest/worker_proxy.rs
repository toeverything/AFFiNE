//! Worker proxy REST routes (`image-proxy`, `link-preview`) and shared CORS/throttle helpers.

use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use axum::extract::{ConnectInfo, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Extension, Router};
use reqwest::Method;
use serde_json::{Value, json};
use server_domain::safe_fetch::{SafeFetchError, SafeFetchPolicy, SafeFetchRequest, safe_fetch};
use sha2::{Digest as _, Sha256};
use url::{Origin, Url};

use crate::RouterState;
use crate::legacy_compat::errors::LegacyErrorEnvelope;
use crate::rest::{apply_blob_security_headers, envelope_to_http_response, resolve_request_principal_with_policy};

const MAX_PREVIEW_MEDIA_ITEMS: usize = 32;
const MAX_PREVIEW_URL_BYTES: usize = 2_048;
const CACHE_TTL: Duration = Duration::from_secs(30 * 60);
const CACHE_MAX_TOTAL_BYTES: usize = 16 * 1024 * 1024;
type CachedEntry = (Instant, String, Option<String>, Vec<u8>);
static PROXY_CACHE: OnceLock<Mutex<(HashMap<String, CachedEntry>, usize)>> = OnceLock::new();
pub(crate) type ThrottleQuota = (u64, u64, u64);
fn h_str(h: &HeaderMap, name: header::HeaderName) -> Option<&str> {
  h.get(name).and_then(|v| v.to_str().ok())
}
const REDIS_THROTTLE_SCRIPT: &str = "local n=redis.call('TIME') local m=n[1]*1000+math.floor(n[2]/1000) \
local bu=tonumber(redis.call('HGET',KEYS[1],'blockedUntil')) or 0 \
if bu>m then return {tonumber(redis.call('HGET',KEYS[1],'hits')) or 0,redis.call('PTTL',KEYS[1]),bu-m} end \
if bu>0 then redis.call('HDEL',KEYS[1],'blockedUntil') redis.call('HSET',KEYS[1],'hits',0) end \
local h=redis.call('HINCRBY',KEYS[1],'hits',1) if h==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end \
local bt=0 if h>tonumber(ARGV[2]) then bu=m+tonumber(ARGV[3]) redis.call('HSET',KEYS[1],'blockedUntil',bu) \
if redis.call('PTTL',KEYS[1])<tonumber(ARGV[3]) then redis.call('PEXPIRE',KEYS[1],ARGV[3]) end bt=tonumber(ARGV[3]) end \
return {h,redis.call('PTTL',KEYS[1]),bt}";
pub(crate) fn apply_throttle_headers(h: &mut HeaderMap, quota: Option<&ThrottleQuota>) {
  let Some(&(l, rem, rst)) = quota else { return };
  for (k, v) in [
    ("x-ratelimit-limit", l),
    ("x-ratelimit-remaining", rem),
    ("x-ratelimit-reset", rst),
  ] {
    if let Ok(hv) = HeaderValue::from_str(&v.to_string()) {
      h.insert(header::HeaderName::from_static(k), hv);
    }
  }
}
pub(crate) async fn check_shared_throttle(
  state: &RouterState,
  headers: &HeaderMap,
  peer: Option<SocketAddr>,
  session_id: Option<&str>,
  worker_handler: Option<&str>,
) -> Result<Option<ThrottleQuota>, Box<Response>> {
  let cfg = state.app.app_config.get_effective_app_config().await.ok();
  if cfg.as_ref().and_then(|c| c.pointer("/throttle/enabled")) == Some(&Value::Bool(false)) {
    return Ok(None);
  }
  let def = cfg.as_ref().and_then(|c| c.pointer("/throttle/throttlers/default"));
  let cfg_u64 = |k, min, d| def.and_then(|t| t.get(k)?.as_u64()).filter(|&n| n >= min).unwrap_or(d);
  let (cfg_limit, cfg_ttl) = (cfg_u64("limit", 1, 120), cfg_u64("ttl", 1_000, 60_000));
  let (limit, ttl_ms) = if worker_handler.is_some() {
    (60, 60_000)
  } else {
    (cfg_limit, cfg_ttl)
  };
  let block_ms = cfg_u64("blockDuration", 1_000, ttl_ms);
  let raw_tracker = session_id
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(str::to_owned)
    .or_else(|| {
      ["cf-connecting-ip", "x-forwarded-for", "x-real-ip", "cf-ray"]
        .into_iter()
        .find_map(|n| {
          let v = headers.get(n)?.to_str().ok()?;
          let s = if n == "x-forwarded-for" {
            v.split(',').next()?
          } else {
            v
          }
          .trim();
          (!s.is_empty()).then(|| s.to_owned())
        })
    })
    .or_else(|| peer.map(|a| a.ip().to_string()))
    .unwrap_or_default();
  let tracker = if raw_tracker.len() > 256 {
    format!("sha256:{}", hex::encode(Sha256::digest(raw_tracker.as_bytes())))
  } else {
    raw_tracker
  };
  let key = match worker_handler {
    Some(h) if (limit, ttl_ms) != (cfg_limit, cfg_ttl) => {
      format!("throttler:{tracker};custom;default:WorkerController.{h}")
    }
    _ => format!("throttler:{tracker};default"),
  };
  let redis_res: Option<(u64, i64, i64)> = if let Some(client) = state.app.redis.as_ref() {
    let mut conn = state.app.throttle_redis_conn.lock().await.clone();
    if conn.is_none() {
      conn = tokio::time::timeout(Duration::from_secs(2), client.get_multiplexed_async_connection())
        .await
        .ok()
        .and_then(Result::ok);
    }
    if let Some(mut c) = conn {
      let script = redis::Script::new(REDIS_THROTTLE_SCRIPT);
      let res = tokio::time::timeout(
        Duration::from_secs(2),
        script
          .key(&key)
          .arg(ttl_ms)
          .arg(limit)
          .arg(block_ms.max(1))
          .invoke_async(&mut c),
      )
      .await
      .ok()
      .and_then(Result::ok);
      *state.app.throttle_redis_conn.lock().await = res.map(|_| c);
      res
    } else {
      None
    }
  } else {
    None
  };
  let (hits, pttl_ms, block_rem_ms) = if let Some(v) = redis_res {
    v
  } else {
    type MemMap = HashMap<String, (u64, Instant, Option<Instant>)>;
    static MEM: OnceLock<Mutex<MemMap>> = OnceLock::new();
    let (now, ttl, bdur) = (
      Instant::now(),
      Duration::from_millis(ttl_ms),
      Duration::from_millis(block_ms.max(1)),
    );
    let Ok(mut map) = MEM.get_or_init(|| Mutex::new(HashMap::new())).lock() else {
      return Ok(Some((limit, limit.saturating_sub(1), ttl_ms.div_ceil(1_000))));
    };
    if map.len() >= 4096 {
      map.retain(|_, (_, exp, bu)| *exp > now || bu.is_some_and(|b| b > now));
      if map.len() >= 4096
        && let Some(old) = map.iter().min_by_key(|(_, (_, e, _))| *e).map(|(k, _)| k.clone())
      {
        map.remove(&old);
      }
    }
    let e = map.entry(key).or_insert((0, now + ttl, None));
    if let Some(bu) = e.2.filter(|&b| b > now) {
      (e.0, 0, bu.saturating_duration_since(now).as_millis() as i64)
    } else {
      if e.2.is_some() || e.1 <= now {
        *e = (0, now + ttl, None);
      }
      e.0 += 1;
      let brem = if e.0 > limit {
        e.2 = Some(now + bdur);
        e.1 = e.1.max(now + bdur);
        bdur.as_millis() as i64
      } else {
        0
      };
      (e.0, e.1.saturating_duration_since(now).as_millis() as i64, brem)
    }
  };
  if block_rem_ms > 0 {
    let mut resp = err_env(
      429,
      "Too Many Requests",
      "TOO_MANY_REQUESTS",
      "TOO_MANY_REQUEST",
      "Too many requests.",
    );
    if let Ok(v) = HeaderValue::from_str(&(block_rem_ms as u64).div_ceil(1_000).max(1).to_string()) {
      resp.headers_mut().insert(header::RETRY_AFTER, v);
    }
    return Err(Box::new(resp));
  }
  Ok(Some((
    limit,
    limit.saturating_sub(hits),
    (pttl_ms.max(0) as u64).div_ceil(1_000),
  )))
}
fn cache_get(key: &str) -> Option<CachedEntry> {
  let mut g = PROXY_CACHE.get_or_init(Default::default).lock().ok()?;
  if g.0.get(key).is_some_and(|e| e.0.elapsed() >= CACHE_TTL) {
    if let Some(old) = g.0.remove(key) {
      g.1 = g.1.saturating_sub(old.3.len());
    }
    return None;
  }
  g.0.get(key).cloned()
}
fn cache_put(key: String, ct: &str, cd: Option<String>, body: Vec<u8>) {
  if body.len() > 256 * 1024 {
    return;
  }
  let Ok(mut g) = PROXY_CACHE.get_or_init(Default::default).lock() else {
    return;
  };
  let (now, (entries, total)) = (Instant::now(), &mut *g);
  if let Some(old) = entries.remove(&key) {
    *total = total.saturating_sub(old.3.len());
  }
  entries.retain(|_, v| {
    let keep = now.duration_since(v.0) < CACHE_TTL;
    if !keep {
      *total = total.saturating_sub(v.3.len());
    }
    keep
  });
  while (entries.len() >= 256 || *total + body.len() > CACHE_MAX_TOTAL_BYTES)
    && let Some(old_k) = entries.iter().min_by_key(|(_, v)| v.0).map(|(k, _)| k.clone())
    && let Some(old) = entries.remove(&old_k)
  {
    *total = total.saturating_sub(old.3.len());
  }
  if *total + body.len() <= CACHE_MAX_TOTAL_BYTES {
    *total += body.len();
    entries.insert(key, (now, ct.to_owned(), cd, body));
  }
}
async fn with_worker_throttle<F, Fut>(
  state: &RouterState,
  headers: &HeaderMap,
  peer: Option<SocketAddr>,
  handler: &str,
  require_origin: bool,
  inner: F,
) -> Response
where
  F: FnOnce(Vec<String>) -> Fut,
  Fut: std::future::Future<Output = Response>,
{
  let resolved = match resolve_request_principal_with_policy(state, headers, true).await {
    Ok(r) => r,
    Err(err) => return err.into_http_response(),
  };
  let https = state.app.config.load().https;
  let sid = resolved.principal.as_ref().map(|p| p.session_id());
  let quota = match check_shared_throttle(state, headers, peer, sid, Some(handler)).await {
    Ok(q) => q,
    Err(mut r) => {
      resolved.cookie_action.apply_to(r.headers_mut(), https);
      return *r;
    }
  };
  let allowed = allowed_origins_for_state(state, false);
  let mut resp = if require_origin && !check_origin_or_referer(headers, &allowed) {
    bad_request_envelope("Invalid header")
  } else {
    inner(allowed).await
  };
  apply_throttle_headers(resp.headers_mut(), quota.as_ref());
  resolved.cookie_action.apply_to(resp.headers_mut(), https);
  resp
}
type PeerExt = Option<Extension<ConnectInfo<SocketAddr>>>;
async fn handle_worker_options(
  st: RouterState,
  peer: PeerExt,
  h: HeaderMap,
  spec: (&'static str, &'static str, &'static str),
) -> Response {
  let h_ref = &h;
  with_worker_throttle(&st, h_ref, peer.map(|c| c.0.0), spec.0, false, |allowed| async move {
    let hdrs = [
      (header::ACCESS_CONTROL_ALLOW_METHODS, spec.1),
      (header::ACCESS_CONTROL_ALLOW_HEADERS, spec.2),
    ];
    let mut r = (StatusCode::NO_CONTENT, hdrs).into_response();
    append_cors_origin(r.headers_mut(), h_str(h_ref, header::ORIGIN), &allowed);
    r
  })
  .await
}
pub(crate) fn router() -> Router<RouterState> {
  let img_opt = |State(s): State<RouterState>, p, h| {
    handle_worker_options(s, p, h, ("imageProxyOption", "GET, OPTIONS", "Content-Type"))
  };
  let lp_opt = |State(s): State<RouterState>, p, h| {
    handle_worker_options(
      s,
      p,
      h,
      ("linkPreviewOption", "POST, OPTIONS", "Content-Type, x-affine-version"),
    )
  };
  Router::new()
    .route("/api/worker/image-proxy", get(handle_image_proxy).options(img_opt))
    .route("/api/worker/link-preview", post(handle_link_preview).options(lp_opt))
}
fn err_env(status: u16, code: &str, ty: &str, name: &str, msg: impl Into<String>) -> Response {
  let e = LegacyErrorEnvelope {
    status,
    code: code.into(),
    error_type: ty.into(),
    name: name.into(),
    message: msg.into(),
    data: None,
  };
  envelope_to_http_response(e)
}
pub(crate) fn bad_request_envelope(message: impl Into<String>) -> Response {
  err_env(400, "Bad Request", "BAD_REQUEST", "BAD_REQUEST", message)
}
pub(crate) fn ssrf_error_to_bad_request_reason(err: &SafeFetchError) -> &'static str {
  match err.ssrf_reason() {
    Some("disallowed_protocol" | "url_has_credentials" | "blocked_hostname" | "blocked_ip" | "invalid_url") => {
      "Invalid URL"
    }
    Some("unresolvable_hostname") => "Failed to resolve hostname",
    Some("too_many_redirects") => "Too many redirects",
    Some(_) => "Blocked by SSRF protection",
    None => match err {
      SafeFetchError::ResponseTooLarge { .. } => "Response too large",
      SafeFetchError::Timeout | SafeFetchError::RequestFailed(_) => "Failed to fetch",
      _ => "Blocked by SSRF protection",
    },
  }
}
pub(crate) fn allowed_origins_for_state(state: &RouterState, include_telemetry: bool) -> Vec<String> {
  let cfg = state.app.config.load();
  let mut out = Vec::new();
  let scheme = Url::parse(&cfg.external_url).map_or("http".to_owned(), |u| u.scheme().to_owned());
  let extra = if include_telemetry {
    &cfg.telemetry_allowed_origins[..]
  } else {
    &[]
  };
  for raw in std::iter::once(cfg.external_url.as_str())
    .chain(cfg.app_config_baseline.server.hosts.iter().map(String::as_str))
    .chain(extra.iter().map(String::as_str))
  {
    let t = raw.trim().trim_end_matches('/');
    let cand = if t.contains("://") {
      t.to_owned()
    } else {
      format!("{scheme}://{t}")
    };
    if !t.is_empty()
      && let Ok(u) = Url::parse(&cand)
      && let Some(o) = match u.scheme() {
        "http" | "https" => Some(u.origin().ascii_serialization()),
        "assets" if include_telemetry => Some(u.as_str().to_owned()),
        _ => None,
      }
      && !out.contains(&o)
    {
      out.push(o);
    }
  }
  out
}
pub(crate) fn append_cors_origin(target: &mut HeaderMap, origin: Option<&str>, allowed: &[String]) {
  if let Some(o) = origin
    && allowed.iter().any(|e| e == o)
    && let Ok(val) = HeaderValue::from_str(o)
  {
    target.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, val);
    target.insert(header::VARY, HeaderValue::from_static("Origin"));
  }
}
fn check_origin_or_referer(headers: &HeaderMap, allowed: &[String]) -> bool {
  h_str(headers, header::ORIGIN).is_some_and(|o| allowed.iter().any(|e| e == o))
    || h_str(headers, header::REFERER)
      .and_then(|r| Url::parse(r).ok())
      .is_some_and(|u| {
        let s = u.origin().ascii_serialization();
        let o = if s == "null" {
          format!("{}://{}", u.scheme(), u.host_str().unwrap_or(""))
        } else {
          s
        };
        allowed.iter().any(|e| e == &o)
      })
}
fn fix_url_with_policy(raw: &str, allow_private: &[Origin]) -> Option<Url> {
  let t = raw.trim();
  if t.is_empty() || t.chars().any(char::is_control) {
    return None;
  }
  let cand = if t.starts_with("http:") || t.starts_with("https:") {
    t.to_owned()
  } else if t.contains("://") {
    return None;
  } else {
    format!("http://{t}")
  };
  let mut parsed = Url::parse(&cand)
    .ok()
    .filter(|u| matches!(u.scheme(), "http" | "https"))?;
  let host = parsed.host_str().filter(|h| !h.is_empty())?;
  let is_ip = host.trim_matches(['[', ']']).parse::<IpAddr>().is_ok();
  if !allow_private.contains(&parsed.origin()) && (is_ip || !host.contains('.')) {
    return None;
  }
  if host.eq_ignore_ascii_case("open.spotify.com") {
    let pairs: Vec<(String, String)> = parsed
      .query_pairs()
      .filter(|(k, _)| k != "si")
      .map(|(k, v)| (k.into_owned(), v.into_owned()))
      .collect();
    parsed.set_query(None);
    if !pairs.is_empty() {
      parsed.query_pairs_mut().extend_pairs(pairs);
    }
  }
  Some(parsed)
}
fn build_outbound_headers(source: &HeaderMap) -> reqwest::header::HeaderMap {
  let mut out = reqwest::header::HeaderMap::new();
  for (name, val) in source {
    let l = name.as_str().to_ascii_lowercase();
    if l != "accept-encoding"
      && (l == "accept" || l == "accept-language" || l == "user-agent" || l.starts_with("sec-"))
      && let Ok(rn) = reqwest::header::HeaderName::from_bytes(name.as_str().as_bytes())
      && let Ok(rv) = reqwest::header::HeaderValue::from_bytes(val.as_bytes())
    {
      out.append(rn, rv);
    }
  }
  if !out.contains_key(reqwest::header::USER_AGENT) {
    out.insert(
      reqwest::header::USER_AGENT,
      reqwest::header::HeaderValue::from_static("AFFiNE-Worker-Proxy/1.0"),
    );
  }
  out
}
fn build_worker_fetch_policy(state: &RouterState, max_response_bytes: usize) -> SafeFetchPolicy {
  let allow_private_origins = state
    .app
    .config
    .load()
    .worker_proxy_allow_private_origins
    .iter()
    .filter_map(|r| Url::parse(r).ok().map(|u| u.origin()))
    .collect();
  SafeFetchPolicy {
    allow_http: true,
    allowed_hosts: Vec::new(),
    allow_private_origins,
    allow_cross_origin_body_replay: false,
    max_redirects: 3,
    connect_timeout: Duration::from_secs(3),
    timeout: Duration::from_secs(10),
    max_response_bytes,
  }
}
fn detect_image_mime(bytes: &[u8], upstream_ct: Option<&str>) -> Option<&'static str> {
  use image::ImageFormat as F;
  if let Ok(fmt) = image::guess_format(bytes) {
    return matches!(fmt, F::Png | F::Jpeg | F::Gif | F::WebP | F::Bmp | F::Ico).then(|| fmt.to_mime_type());
  }
  let text = std::str::from_utf8(&bytes[..bytes.len().min(512)])
    .ok()?
    .trim_start()
    .to_ascii_lowercase();
  let svg = text.starts_with("<svg")
    || (text.starts_with("<?xml") && text.contains("<svg"))
    || upstream_ct.is_some_and(|ct| ct.to_ascii_lowercase().starts_with("image/svg+xml"));
  (svg && text.contains("<svg")).then_some("image/svg+xml")
}
fn fetch_req(
  method: Method,
  url: &Url,
  headers: reqwest::header::HeaderMap,
  policy: SafeFetchPolicy,
) -> SafeFetchRequest {
  SafeFetchRequest {
    method,
    url: url.to_string(),
    headers,
    body: None,
    policy,
  }
}
fn fetch_err_response(err: &SafeFetchError, fallback: &str) -> Response {
  let use_ssrf = err.ssrf_reason().is_some() || matches!(err, SafeFetchError::ResponseTooLarge { .. });
  bad_request_envelope(if use_ssrf {
    ssrf_error_to_bad_request_reason(err)
  } else {
    fallback
  })
}
async fn handle_image_proxy(
  State(st): State<RouterState>,
  peer: PeerExt,
  Query(params): Query<HashMap<String, String>>,
  hdrs: HeaderMap,
) -> Response {
  let (st, hdrs) = (&st, &hdrs);
  with_worker_throttle(
    st,
    hdrs,
    peer.map(|c| c.0.0),
    "imageProxy",
    true,
    |allowed| async move {
      let Some(raw_url) = params.get("url").filter(|s| !s.is_empty()) else {
        return bad_request_envelope("Missing \"url\" parameter");
      };
      let policy = build_worker_fetch_policy(st, 10 * 1024 * 1024);
      let Some(target) = fix_url_with_policy(raw_url, &policy.allow_private_origins) else {
        return bad_request_envelope("Invalid URL");
      };
      let origin = h_str(hdrs, header::ORIGIN);
      let ck = format!("img:{target}");
      let (body, mime, cd) = if let Some(c) = cache_get(&ck) {
        (c.3, c.1, c.2)
      } else {
        let Ok(_permit) = st.app.worker_proxy_sem.try_acquire() else {
          return StatusCode::TOO_MANY_REQUESTS.into_response();
        };
        let fetched = match safe_fetch(fetch_req(Method::GET, &target, build_outbound_headers(hdrs), policy)).await {
          Ok(r) => r,
          Err(err) => return fetch_err_response(&err, "Failed to fetch image"),
        };
        if !fetched.status.is_success() {
          return bad_request_envelope("Failed to fetch image");
        }
        let up_hdr = |k| fetched.headers.get(k).and_then(|v| v.to_str().ok());
        let (up_ct, up_cd) = (
          up_hdr(reqwest::header::CONTENT_TYPE),
          up_hdr(reqwest::header::CONTENT_DISPOSITION).map(str::to_owned),
        );
        let Some(mime) = detect_image_mime(&fetched.body, up_ct) else {
          return bad_request_envelope("Invalid image");
        };
        cache_put(ck, mime, up_cd.clone(), fetched.body.clone());
        (fetched.body, mime.to_owned(), up_cd)
      };
      let mut resp = (StatusCode::OK, [(header::ACCESS_CONTROL_ALLOW_METHODS, "GET")], body).into_response();
      let h = resp.headers_mut();
      append_cors_origin(h, origin, &allowed);
      if let Ok(ct) = HeaderValue::from_str(&mime) {
        h.insert(header::CONTENT_TYPE, ct);
      }
      let fname = target
        .path_segments()
        .and_then(|mut s| s.next_back())
        .filter(|s| !s.is_empty());
      apply_blob_security_headers(h, Some(&mime), fname);
      if mime != "image/svg+xml"
        && let Some(val) = cd.as_deref().and_then(|c| HeaderValue::from_str(c).ok())
      {
        h.insert(header::CONTENT_DISPOSITION, val);
      }
      resp
    },
  )
  .await
}
fn push_unique_url(raw: &str, base: &Url, out: &mut Vec<String>) {
  let t = raw.trim();
  if out.len() < MAX_PREVIEW_MEDIA_ITEMS
    && !t.is_empty()
    && t.len() <= MAX_PREVIEW_URL_BYTES
    && let Ok(u) = base.join(t)
    && matches!(u.scheme(), "http" | "https")
    && u.as_str().len() <= MAX_PREVIEW_URL_BYTES
    && !out.iter().any(|x| x == u.as_str())
  {
    out.push(u.into());
  }
}
fn extract_attr(tag: &str, attr_name: &str) -> Option<String> {
  let (lower, needle, mut pos0) = (tag.to_ascii_lowercase(), format!("{attr_name}="), 0usize);
  while let Some(pos) = lower[pos0..].find(&needle) {
    let abs = pos0 + pos;
    if abs == 0 || tag.as_bytes()[abs - 1].is_ascii_whitespace() || tag.as_bytes()[abs - 1] == b'<' {
      let rest = tag[abs + needle.len()..].trim_start();
      for q in ['"', '\''] {
        if let Some(s) = rest.strip_prefix(q) {
          return s.find(q).map(|e| s[..e].to_owned());
        }
      }
      let end = rest
        .find(|c: char| c.is_ascii_whitespace() || matches!(c, '>' | '/'))
        .unwrap_or(rest.len());
      return Some(rest[..end].to_owned());
    }
    pos0 = abs + needle.len();
  }
  None
}
fn decode_html_bytes(bytes: &[u8], content_type: Option<&str>) -> String {
  let hdr_cs = content_type.and_then(|ct| {
    ct.split(';').skip(1).find_map(|p| {
      let (k, v) = p.split_once('=')?;
      k.trim()
        .eq_ignore_ascii_case("charset")
        .then(|| v.trim().trim_matches('"').to_owned())
    })
  });
  let probe = String::from_utf8_lossy(&bytes[..bytes.len().min(2048)]).to_ascii_lowercase();
  let meta_cs = probe.find("charset=").map(|i| {
    probe[i + 8..]
      .trim_start_matches(['"', '\'', ' '])
      .split(|c: char| matches!(c, '"' | '\'' | ';' | '>') || c.is_whitespace())
      .next()
      .unwrap_or("")
      .to_owned()
  });
  hdr_cs
    .or(meta_cs)
    .and_then(|l| encoding_rs::Encoding::for_label(l.as_bytes()))
    .map_or_else(
      || String::from_utf8_lossy(bytes).into_owned(),
      |e| e.decode(bytes).0.into_owned(),
    )
}
fn parse_html_preview(html: &str, final_url: &Url) -> (serde_json::Map<String, Value>, Vec<String>) {
  let (mut title, mut site_name, mut desc, mut media_type) = (None, None, None, None);
  let (mut images, mut videos, mut favicons) = (Vec::new(), Vec::new(), Vec::new());
  let lower = html.to_ascii_lowercase();
  if let Some(ts) = lower.find("<title")
    && let Some(gt) = lower[ts..].find('>')
    && let Some(te) = lower[ts + gt + 1..].find("</title>")
  {
    let t = html[ts + gt + 1..ts + gt + 1 + te].trim();
    title = (!t.is_empty()).then(|| t.to_owned());
  }
  let mut cursor = 0usize;
  while let Some(rs) = html[cursor..].find('<') {
    let start = cursor + rs;
    let Some(re) = html[start..].find('>') else { break };
    let tag = &html[start + 1..start + re];
    cursor = start + re + 1;
    let name = tag
      .split_whitespace()
      .next()
      .unwrap_or("")
      .trim_end_matches('/')
      .to_ascii_lowercase();
    match name.as_str() {
      "meta" => {
        if let (Some(p), Some(c)) = (
          extract_attr(tag, "property").or_else(|| extract_attr(tag, "name")),
          extract_attr(tag, "content"),
        ) {
          match p.to_ascii_lowercase().as_str() {
            "og:title" => title = Some(c),
            "og:site_name" => site_name = Some(c),
            "og:description" => desc = Some(c),
            "og:image" => push_unique_url(&c, final_url, &mut images),
            "og:video" => push_unique_url(&c, final_url, &mut videos),
            "og:type" => media_type = Some(c),
            "description" if desc.is_none() => desc = Some(c),
            _ => {}
          }
        }
      }
      "link" if extract_attr(tag, "rel").is_some_and(|r| r.to_ascii_lowercase().contains("icon")) => {
        if let Some(href) = extract_attr(tag, "href") {
          push_unique_url(&href, final_url, &mut favicons);
        }
      }
      "img" | "video" => {
        if let Some(src) = extract_attr(tag, "src") {
          push_unique_url(&src, final_url, if name == "img" { &mut images } else { &mut videos });
        }
      }
      _ => {}
    }
  }
  let mut map = serde_json::Map::from_iter([
    ("url".into(), json!(final_url.as_str())),
    ("images".into(), json!(images)),
    ("videos".into(), json!(videos)),
  ]);
  for (k, v) in [
    ("title", title),
    ("siteName", site_name),
    ("description", desc),
    ("mediaType", media_type),
  ] {
    if let Some(v) = v {
      map.insert(k.into(), json!(v));
    }
  }
  (map, favicons)
}
async fn handle_link_preview(
  State(st): State<RouterState>,
  peer: PeerExt,
  hdrs: HeaderMap,
  body: bytes::Bytes,
) -> Response {
  let (st, hdrs) = (&st, &hdrs);
  with_worker_throttle(
    st,
    hdrs,
    peer.map(|c| c.0.0),
    "linkPreview",
    true,
    |allowed| async move {
      let req_val = serde_json::from_slice::<Value>(&body).ok();
      let mut policy = build_worker_fetch_policy(st, 2 * 1024 * 1024);
      let Some(target) = req_val
        .as_ref()
        .and_then(|v| fix_url_with_policy(v.get("url")?.as_str()?, &policy.allow_private_origins))
      else {
        return bad_request_envelope("Invalid URL");
      };
      let is_self = |u: &Url| allowed.iter().any(|e| e == &u.origin().ascii_serialization());
      if is_self(&target) {
        return bad_request_envelope("Invalid URL");
      }
      let head_only = req_val.as_ref().and_then(|v| v.get("head")?.as_bool()).unwrap_or(false);
      let (origin, ck) = (
        h_str(hdrs, header::ORIGIN),
        format!("lp:{}:{target}", if head_only { "h" } else { "g" }),
      );
      let json_resp = |st: StatusCode, bytes: Vec<u8>| {
        let mut r = (st, [(header::CONTENT_TYPE, "application/json;charset=UTF-8")], bytes).into_response();
        append_cors_origin(r.headers_mut(), origin, &allowed);
        r
      };
      if !head_only && let Some(c) = cache_get(&ck) {
        return json_resp(StatusCode::OK, c.3);
      }
      let Ok(_permit) = st.app.worker_proxy_sem.try_acquire() else {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
      };
      let m = if head_only { Method::HEAD } else { Method::GET };
      let fetched = match safe_fetch(fetch_req(m, &target, build_outbound_headers(hdrs), policy.clone())).await {
        Ok(r) => r,
        Err(err) => return fetch_err_response(&err, "Error fetching URL"),
      };
      if is_self(&fetched.final_url) {
        return bad_request_envelope("Invalid URL");
      }
      if head_only {
        let st = if (200..400).contains(&fetched.status.as_u16()) {
          StatusCode::NO_CONTENT
        } else {
          StatusCode::from_u16(fetched.status.as_u16()).unwrap_or(StatusCode::BAD_REQUEST)
        };
        let mut r = st.into_response();
        append_cors_origin(r.headers_mut(), origin, &allowed);
        return r;
      }
      let ct = fetched
        .headers
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok());
      let (mut preview, mut favicons) = parse_html_preview(&decode_html_bytes(&fetched.body, ct), &fetched.final_url);
      if favicons.len() < MAX_PREVIEW_MEDIA_ITEMS
        && let Ok(fav_url) = fetched.final_url.join("/favicon.ico?v=2")
        && !is_self(&fav_url)
      {
        policy.max_response_bytes = 64 * 1024;
        if safe_fetch(fetch_req(
          Method::HEAD,
          &fav_url,
          reqwest::header::HeaderMap::new(),
          policy,
        ))
        .await
        .is_ok_and(|fr| fr.status.is_success())
        {
          push_unique_url(fav_url.as_str(), &fetched.final_url, &mut favicons);
        }
      }
      preview.insert("favicons".into(), json!(favicons));
      let json = serde_json::to_vec(&Value::Object(preview)).unwrap_or_else(|_| b"{}".to_vec());
      cache_put(ck, "application/json;charset=UTF-8", None, json.clone());
      json_resp(StatusCode::OK, json)
    },
  )
  .await
}
