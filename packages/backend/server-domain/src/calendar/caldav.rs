//! CalDAV provider built on [`crate::safe_fetch::safe_fetch`] and streaming
//! XML/iCalendar parsing.
//!
//! Aligns with `v0.27.5` `plugins/calendar/providers/caldav.ts`:
//! - Strict SSRF enforcement and exact GraphQL error-code mapping.
//! - Basic and Digest (`MD5` / `SHA-256`, including `-sess` and `qop=auth`)
//!   HTTP authentication with automatic 401 retry when `authType == auto`.
//! - Discovery (`/.well-known/caldav` fallback to `serverUrl` -> principal ->
//!   calendar-home-set), calendar listing (`PROPFIND`), and incremental or
//!   time-range event sync (`REPORT sync-collection` / `calendar-query`).
use super::ical::{escape_xml, format_utc_for_ical, parse_multistatus, try_parse_ical_events};
use super::{
  CalendarAccountRecord, CalendarError, CalendarProviderCalendar, CalendarProviderEvent, CalendarProviderEventRaw,
  CalendarProviderEventTime, CalendarProviderListEventsResult,
};
use crate::safe_fetch::{
  SafeFetchError, SafeFetchPolicy, SafeFetchRequest, SafeFetchResponse, is_allowed_host, safe_fetch,
};
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use rand::RngCore as _;
use reqwest::Method;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderName, HeaderValue, WWW_AUTHENTICATE};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::time::Duration;
use url::Url;
const DEFAULT_REQUEST_TIMEOUT_MS: u64 = 10_000;
const DEFAULT_MAX_REDIRECTS: usize = 5;
const DEFAULT_MAX_RESPONSE_BYTES: usize = 50 * 1024 * 1024;
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CalendarCaldavAuthType {
  #[default]
  Auto,
  Basic,
  Digest,
}
impl CalendarCaldavAuthType {
  pub fn parse(raw: Option<&str>) -> Self {
    match raw.map(str::to_ascii_lowercase).as_deref() {
      Some("basic") => Self::Basic,
      Some("digest") => Self::Digest,
      _ => Self::Auto,
    }
  }
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Auto => "auto",
      Self::Basic => "basic",
      Self::Digest => "digest",
    }
  }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarCaldavProviderPreset {
  pub id: String,
  pub label: String,
  pub server_url: String,
  #[serde(default)]
  pub auth_type: Option<CalendarCaldavAuthType>,
  #[serde(default)]
  pub requires_app_password: Option<bool>,
  #[serde(default)]
  pub docs_url: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarCaldavConfig {
  #[serde(default)]
  pub enabled: bool,
  #[serde(default)]
  pub allow_custom_provider: Option<bool>,
  #[serde(default)]
  pub providers: Vec<CalendarCaldavProviderPreset>,
  #[serde(default)]
  pub allow_insecure_http: Option<bool>,
  #[serde(default)]
  pub allowed_hosts: Option<Vec<String>>,
  #[serde(default)]
  pub block_private_network: Option<bool>,
  #[serde(default)]
  pub request_timeout_ms: Option<u64>,
  #[serde(default)]
  pub max_redirects: Option<usize>,
}
impl CalendarCaldavConfig {
  pub fn is_configured(&self) -> bool {
    self.enabled && !self.providers.is_empty()
  }
  fn allow_insecure_http(&self) -> bool {
    self.allow_insecure_http.unwrap_or(false)
  }
  fn block_private_network(&self) -> bool {
    self.block_private_network.unwrap_or(true)
  }
  fn allowed_hosts(&self) -> Vec<String> {
    self.allowed_hosts.clone().unwrap_or_default()
  }
  fn timeout(&self) -> Duration {
    Duration::from_millis(
      self
        .request_timeout_ms
        .filter(|&ms| ms > 0)
        .unwrap_or(DEFAULT_REQUEST_TIMEOUT_MS),
    )
  }
  fn max_redirects(&self) -> usize {
    self.max_redirects.unwrap_or(DEFAULT_MAX_REDIRECTS)
  }
}
#[derive(Clone, Debug)]
pub struct CaldavDiscoveryResult {
  pub provider_account_id: String,
  pub server_url: String,
  pub principal_url: String,
  pub calendar_home_url: String,
  pub auth_type: Option<CalendarCaldavAuthType>,
}
/// Maps a [`SafeFetchError`] to the exact `v0.27.5` `caldav.ts:598-643`
/// GraphQL error code when it represents an SSRF or policy denial.
pub fn map_safe_fetch_error(err: SafeFetchError) -> CalendarError {
  match err.ssrf_reason() {
    Some("blocked_ip") => CalendarError::bad_request("caldav_private_network", "CalDAV host is in a private network."),
    Some("unresolvable_hostname") => CalendarError::bad_request("caldav_dns_failed", "Unable to resolve CalDAV host."),
    Some("disallowed_protocol") => CalendarError::bad_request("caldav_insecure_url", "CalDAV URL must use https."),
    Some("too_many_redirects") => {
      CalendarError::bad_request("caldav_max_redirects", "CalDAV request exceeded redirect limit.")
    }
    Some("host_not_allowed") => CalendarError::bad_request("caldav_host_blocked", "CalDAV host is not allowed."),
    Some("invalid_url" | "blocked_hostname" | "url_has_credentials") => {
      CalendarError::bad_request("caldav_invalid_url", "CalDAV URL is invalid.")
    }
    Some("cross_origin_body_replay") => {
      CalendarError::bad_request("caldav_invalid_url", "CalDAV cross-origin redirect blocked.")
    }
    _ => CalendarError::ProviderRequest {
      status: 502,
      message: err.to_string(),
    },
  }
}
fn resolve_href(href: &str, base_url: &str) -> String {
  Url::parse(base_url)
    .and_then(|base| base.join(href))
    .map(String::from)
    .unwrap_or_else(|_| href.to_owned())
}
#[derive(Clone, Debug)]
struct DigestChallenge {
  realm: String,
  nonce: String,
  qop: Option<String>,
  algorithm: Option<String>,
  opaque: Option<String>,
}
fn split_header_tokens(value: &str) -> Vec<String> {
  let mut tokens = Vec::new();
  let mut cur = String::new();
  let mut in_quotes = false;
  for ch in value.chars() {
    match ch {
      '"' => {
        in_quotes = !in_quotes;
        cur.push(ch);
      }
      ',' if !in_quotes => {
        let trimmed = cur.trim();
        if !trimmed.is_empty() {
          tokens.push(trimmed.to_owned());
        }
        cur.clear();
      }
      _ => cur.push(ch),
    }
  }
  let trimmed = cur.trim();
  if !trimmed.is_empty() {
    tokens.push(trimmed.to_owned());
  }
  tokens
}
fn find_digest_challenge(headers: &HeaderMap) -> Option<DigestChallenge> {
  headers
    .get_all(WWW_AUTHENTICATE)
    .iter()
    .filter_map(|v| v.to_str().ok())
    .find_map(parse_digest_challenge)
}
fn parse_digest_challenge(header: &str) -> Option<DigestChallenge> {
  let lower = header.to_ascii_lowercase();
  let idx = lower.find("digest ")?;
  let rest = &header[idx + 7..];
  let mut params = HashMap::new();
  for part in split_header_tokens(rest) {
    if let Some((k, v)) = part.split_once('=') {
      let key = k.trim().to_ascii_lowercase();
      let val = v.trim().trim_matches('"').to_owned();
      params.insert(key, val);
    }
  }
  let nonce = params.remove("nonce")?;
  Some(DigestChallenge {
    realm: params.remove("realm").unwrap_or_default(),
    nonce,
    qop: params.remove("qop"),
    algorithm: params.remove("algorithm"),
    opaque: params.remove("opaque"),
  })
}
/// Pure-Rust RFC 1321 MD5 digest for CalDAV HTTP Digest authentication.
fn md5_hex(input: &[u8]) -> String {
  const S: [u32; 64] = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
    21,
  ];
  const K: [u32; 64] = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501, 0x698098d8,
    0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
    0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8, 0x21e1cde6, 0xc33707d6, 0xf4d50d87,
    0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039,
    0xe6db99e5, 0x1fa27cf8, 0xc4ac5665, 0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
    0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb,
    0xeb86d391,
  ];
  let mut msg = input.to_vec();
  let bit_len = (input.len() as u64).wrapping_mul(8);
  msg.push(0x80);
  while (msg.len() % 64) != 56 {
    msg.push(0);
  }
  msg.extend_from_slice(&bit_len.to_le_bytes());
  let (mut a0, mut b0, mut c0, mut d0) = (0x67452301u32, 0xefcdab89u32, 0x98badcfeu32, 0x10325476u32);
  for chunk in msg.as_chunks::<64>().0 {
    let mut m = [0u32; 16];
    for (idx, word) in m.iter_mut().enumerate() {
      let off = idx * 4;
      *word = u32::from_le_bytes([chunk[off], chunk[off + 1], chunk[off + 2], chunk[off + 3]]);
    }
    let (mut a, mut b, mut c, mut d) = (a0, b0, c0, d0);
    for i in 0..64 {
      let (f, g) = match i {
        0..=15 => ((b & c) | ((!b) & d), i),
        16..=31 => ((d & b) | ((!d) & c), (5 * i + 1) % 16),
        32..=47 => (b ^ c ^ d, (3 * i + 5) % 16),
        _ => (c ^ (b | (!d)), (7 * i) % 16),
      };
      let f = f.wrapping_add(a).wrapping_add(K[i]).wrapping_add(m[g]);
      a = d;
      d = c;
      c = b;
      b = b.wrapping_add(f.rotate_left(S[i]));
    }
    a0 = a0.wrapping_add(a);
    b0 = b0.wrapping_add(b);
    c0 = c0.wrapping_add(c);
    d0 = d0.wrapping_add(d);
  }
  let mut out = [0u8; 16];
  out[0..4].copy_from_slice(&a0.to_le_bytes());
  out[4..8].copy_from_slice(&b0.to_le_bytes());
  out[8..12].copy_from_slice(&c0.to_le_bytes());
  out[12..16].copy_from_slice(&d0.to_le_bytes());
  hex::encode(out)
}
fn digest_hash(use_sha256: bool, value: &str) -> String {
  if use_sha256 {
    hex::encode(Sha256::digest(value.as_bytes()))
  } else {
    md5_hex(value.as_bytes())
  }
}
fn build_digest_auth_header(
  challenge: &DigestChallenge,
  method: &str,
  uri: &str,
  username: &str,
  password: &str,
  nonce_count: u32,
) -> String {
  let algo_raw = challenge.algorithm.as_deref().unwrap_or("MD5").to_ascii_lowercase();
  let is_sess = algo_raw.ends_with("-sess");
  let use_sha256 = algo_raw.starts_with("sha-256");
  let qop_values: Vec<&str> = challenge
    .qop
    .as_deref()
    .map(|q| q.split(',').map(str::trim).filter(|s| !s.is_empty()).collect())
    .unwrap_or_default();
  let qop = if qop_values.contains(&"auth") {
    Some("auth")
  } else {
    qop_values.first().copied()
  };
  let mut cnonce_bytes = [0u8; 8];
  rand::rng().fill_bytes(&mut cnonce_bytes);
  let cnonce = hex::encode(cnonce_bytes);
  let nc = format!("{nonce_count:08x}");
  let ha1_raw = format!("{username}:{}:{password}", challenge.realm);
  let ha1 = if is_sess {
    let inner = digest_hash(use_sha256, &ha1_raw);
    digest_hash(use_sha256, &format!("{inner}:{}:{cnonce}", challenge.nonce))
  } else {
    digest_hash(use_sha256, &ha1_raw)
  };
  let ha2 = digest_hash(use_sha256, &format!("{method}:{uri}"));
  let response = match qop {
    Some(q) => digest_hash(
      use_sha256,
      &format!("{ha1}:{}:{nc}:{cnonce}:{q}:{ha2}", challenge.nonce),
    ),
    None => digest_hash(use_sha256, &format!("{ha1}:{}:{ha2}", challenge.nonce)),
  };
  let mut parts = vec![
    format!("username=\"{username}\""),
    format!("realm=\"{}\"", challenge.realm),
    format!("nonce=\"{}\"", challenge.nonce),
    format!("uri=\"{uri}\""),
    format!("response=\"{response}\""),
  ];
  if let Some(ref opaque) = challenge.opaque {
    parts.push(format!("opaque=\"{opaque}\""));
  }
  if let Some(ref algo) = challenge.algorithm {
    parts.push(format!("algorithm={algo}"));
  }
  if let Some(q) = qop {
    parts.push(format!("qop={q}"));
    parts.push(format!("nc={nc}"));
    parts.push(format!("cnonce=\"{cnonce}\""));
  }
  format!("Digest {}", parts.join(", "))
}
struct CaldavClient<'a> {
  config: &'a CalendarCaldavConfig,
  username: String,
  password: String,
  preferred_auth_type: CalendarCaldavAuthType,
  resolved_auth_type: Option<CalendarCaldavAuthType>,
  nonce_count: u32,
}
impl<'a> CaldavClient<'a> {
  fn new(
    config: &'a CalendarCaldavConfig,
    username: String,
    password: String,
    preferred_auth_type: CalendarCaldavAuthType,
  ) -> Self {
    Self {
      config,
      username,
      password,
      preferred_auth_type,
      resolved_auth_type: None,
      nonce_count: 1,
    }
  }
  fn auth_type(&self) -> CalendarCaldavAuthType {
    self.resolved_auth_type.unwrap_or(self.preferred_auth_type)
  }
  fn policy_for_url(&self, raw_url: &str) -> Result<SafeFetchPolicy, CalendarError> {
    let parsed =
      Url::parse(raw_url).map_err(|_| CalendarError::bad_request("caldav_invalid_url", "CalDAV URL is invalid."))?;
    let allow_http = self.config.allow_insecure_http();
    if parsed.scheme() != "https" && !(parsed.scheme() == "http" && allow_http) {
      return Err(CalendarError::bad_request(
        "caldav_insecure_url",
        "CalDAV URL must use https.",
      ));
    }
    let allowed_hosts = self.config.allowed_hosts();
    if !allowed_hosts.is_empty() {
      let host = parsed.host_str().unwrap_or_default();
      if !is_allowed_host(host, &allowed_hosts) {
        return Err(CalendarError::bad_request(
          "caldav_host_blocked",
          "CalDAV host is not allowed.",
        ));
      }
    }
    let allow_private_origins = if !self.config.block_private_network() {
      vec![parsed.origin()]
    } else {
      Vec::new()
    };
    Ok(SafeFetchPolicy {
      allow_http,
      allowed_hosts,
      allow_private_origins,
      allow_cross_origin_body_replay: false,
      max_redirects: self.config.max_redirects(),
      connect_timeout: self.config.timeout(),
      timeout: self.config.timeout(),
      max_response_bytes: DEFAULT_MAX_RESPONSE_BYTES,
    })
  }
  async fn execute_fetch(
    &self,
    method: Method,
    url: &str,
    headers: HeaderMap,
    body: Option<Vec<u8>>,
  ) -> Result<SafeFetchResponse, CalendarError> {
    let policy = self.policy_for_url(url)?;
    safe_fetch(SafeFetchRequest {
      method,
      url: url.to_owned(),
      headers,
      body,
      policy,
    })
    .await
    .map_err(map_safe_fetch_error)
  }
  async fn request(
    &mut self,
    method: Method,
    url: &str,
    depth: &str,
    body: String,
  ) -> Result<SafeFetchResponse, CalendarError> {
    let mut base_headers = HeaderMap::new();
    if let Ok(val) = HeaderValue::from_str(depth) {
      base_headers.insert(HeaderName::from_static("depth"), val);
    }
    base_headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/xml; charset=utf-8"));
    if self.preferred_auth_type == CalendarCaldavAuthType::Digest {
      return self.request_digest(method, url, base_headers, body.into_bytes()).await;
    }
    let mut headers = base_headers.clone();
    let basic = BASE64_STANDARD.encode(format!("{}:{}", self.username, self.password));
    if let Ok(val) = HeaderValue::from_str(&format!("Basic {basic}")) {
      headers.insert(AUTHORIZATION, val);
    }
    let resp = self
      .execute_fetch(method.clone(), url, headers, Some(body.as_bytes().to_vec()))
      .await?;
    if resp.status.as_u16() == 401
      && self.preferred_auth_type == CalendarCaldavAuthType::Auto
      && let Some(challenge) = find_digest_challenge(&resp.headers)
    {
      return self
        .retry_digest(method, url, base_headers, body.into_bytes(), &challenge)
        .await;
    }
    if resp.status.is_success() {
      self.resolved_auth_type = Some(CalendarCaldavAuthType::Basic);
    }
    Ok(resp)
  }
  async fn request_digest(
    &mut self,
    method: Method,
    url: &str,
    headers: HeaderMap,
    body: Vec<u8>,
  ) -> Result<SafeFetchResponse, CalendarError> {
    let resp = self
      .execute_fetch(method.clone(), url, headers.clone(), Some(body.clone()))
      .await?;
    if resp.status.as_u16() != 401 {
      if resp.status.is_success() {
        self.resolved_auth_type = Some(CalendarCaldavAuthType::Digest);
      }
      return Ok(resp);
    }
    let Some(challenge) = find_digest_challenge(&resp.headers) else {
      return Ok(resp);
    };
    self.retry_digest(method, url, headers, body, &challenge).await
  }
  async fn retry_digest(
    &mut self,
    method: Method,
    url: &str,
    mut headers: HeaderMap,
    body: Vec<u8>,
    challenge: &DigestChallenge,
  ) -> Result<SafeFetchResponse, CalendarError> {
    let target =
      Url::parse(url).map_err(|_| CalendarError::bad_request("caldav_invalid_url", "CalDAV URL is invalid."))?;
    let uri = match target.query() {
      Some(q) => format!("{}?{q}", target.path()),
      None => target.path().to_owned(),
    };
    let nc = self.nonce_count;
    self.nonce_count = self.nonce_count.saturating_add(1);
    let auth_header = build_digest_auth_header(challenge, method.as_str(), &uri, &self.username, &self.password, nc);
    if let Ok(val) = HeaderValue::from_str(&auth_header) {
      headers.insert(AUTHORIZATION, val);
    }
    let resp = self.execute_fetch(method, url, headers, Some(body)).await?;
    if resp.status.is_success() {
      self.resolved_auth_type = Some(CalendarCaldavAuthType::Digest);
    }
    Ok(resp)
  }
}
fn webdav_method(name: &str) -> Method {
  Method::from_bytes(name.as_bytes()).expect("valid webdav method")
}
/// Stateless CalDAV provider bound to a [`CalendarCaldavConfig`].
#[derive(Clone, Debug)]
pub struct CaldavCalendarProvider {
  config: CalendarCaldavConfig,
}
impl CaldavCalendarProvider {
  pub fn new(config: CalendarCaldavConfig) -> Self {
    Self { config }
  }
  pub async fn discover_account(
    &self,
    preset: &CalendarCaldavProviderPreset,
    username: &str,
    password: &str,
  ) -> Result<CaldavDiscoveryResult, CalendarError> {
    let mut client = CaldavClient::new(
      &self.config,
      username.to_owned(),
      password.to_owned(),
      preset.auth_type.unwrap_or(CalendarCaldavAuthType::Auto),
    );
    let (discovery_url, principal_url) = self
      .fetch_current_user_principal(&mut client, &preset.server_url)
      .await?;
    let calendar_home_url = self.fetch_calendar_home_set(&mut client, &principal_url).await?;
    let auth_type = match client.auth_type() {
      CalendarCaldavAuthType::Auto => None,
      other => Some(other),
    };
    Ok(CaldavDiscoveryResult {
      provider_account_id: principal_url.clone(),
      server_url: discovery_url,
      principal_url,
      calendar_home_url,
      auth_type,
    })
  }
  pub async fn list_calendars(
    &self,
    account: &CalendarAccountRecord,
    password: &str,
  ) -> Result<Vec<CalendarProviderCalendar>, CalendarError> {
    let Some(calendar_home_url) = account.calendar_home_url.as_deref() else {
      return Err(CalendarError::bad_request(
        "caldav_account_missing",
        "CalDAV account metadata is missing.",
      ));
    };
    let username = account
      .username
      .as_deref()
      .or(account.email.as_deref())
      .unwrap_or_default();
    let mut client = CaldavClient::new(
      &self.config,
      username.to_owned(),
      password.to_owned(),
      CalendarCaldavAuthType::parse(account.auth_type.as_deref()),
    );
    let url = resolve_href(
      calendar_home_url,
      account.server_url.as_deref().unwrap_or(calendar_home_url),
    );
    let body = r#"<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:IC="http://apple.com/ns/ical/">
  <D:prop>
    <D:displayname />
    <D:resourcetype />
    <C:calendar-timezone />
    <IC:calendar-color />
  </D:prop>
</D:propfind>"#;
    let resp = client
      .request(webdav_method("PROPFIND"), &url, "1", body.to_owned())
      .await?;
    let text = String::from_utf8_lossy(&resp.body).into_owned();
    if !resp.status.is_success() {
      return Err(CalendarError::ProviderRequest {
        status: resp.status.as_u16(),
        message: text,
      });
    }
    let ms = parse_multistatus(&text);
    let mut calendars = Vec::new();
    for item in ms.responses {
      let Some(href) = item.href.as_deref() else {
        continue;
      };
      let Some(ps) = item.best_propstat() else {
        continue;
      };
      if !ps.is_calendar {
        continue;
      }
      calendars.push(CalendarProviderCalendar {
        id: resolve_href(href, &url),
        summary: ps.displayname.clone(),
        time_zone: ps.calendar_timezone.clone(),
        color_id: ps.calendar_color.clone(),
        primary: false,
      });
    }
    Ok(calendars)
  }
  pub async fn list_events(
    &self,
    account: &CalendarAccountRecord,
    password: &str,
    calendar_id: &str,
    sync_token: Option<&str>,
    time_min: Option<&str>,
    time_max: Option<&str>,
  ) -> Result<CalendarProviderListEventsResult, CalendarError> {
    let Some(server_url) = account.server_url.as_deref() else {
      return Err(CalendarError::bad_request(
        "caldav_account_missing",
        "CalDAV account metadata is missing.",
      ));
    };
    let username = account
      .username
      .as_deref()
      .or(account.email.as_deref())
      .unwrap_or_default();
    let mut client = CaldavClient::new(
      &self.config,
      username.to_owned(),
      password.to_owned(),
      CalendarCaldavAuthType::parse(account.auth_type.as_deref()),
    );
    let calendar_url = resolve_href(calendar_id, server_url);
    if let Some(token) = sync_token {
      match self.sync_collection(&mut client, &calendar_url, token).await {
        Ok(res) => return Ok(res),
        Err(CalendarError::ProviderRequest {
          status: 403 | 404 | 409 | 410 | 501,
          message,
        }) => {
          return Err(CalendarError::SyncTokenInvalid(message));
        }
        Err(other) => return Err(other),
      }
    }
    self
      .calendar_query(&mut client, &calendar_url, time_min, time_max)
      .await
  }
  async fn fetch_current_user_principal(
    &self,
    client: &mut CaldavClient<'_>,
    server_url: &str,
  ) -> Result<(String, String), CalendarError> {
    let body = r#"<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:current-user-principal />
  </D:prop>
</D:propfind>"#;
    let well_known_url = Url::parse(server_url)
      .and_then(|u| u.join("/.well-known/caldav"))
      .map(String::from)
      .map_err(|_| CalendarError::bad_request("caldav_invalid_url", "CalDAV URL is invalid."))?;
    let resp = match client
      .request(webdav_method("PROPFIND"), &well_known_url, "0", body.to_owned())
      .await
    {
      Ok(r) if matches!(r.status.as_u16(), 400 | 404 | 405 | 501) && well_known_url != server_url => {
        client
          .request(webdav_method("PROPFIND"), server_url, "0", body.to_owned())
          .await?
      }
      Err(CalendarError::BadRequest { ref code, .. })
        if matches!(code.as_str(), "caldav_invalid_url" | "caldav_max_redirects") && well_known_url != server_url =>
      {
        client
          .request(webdav_method("PROPFIND"), server_url, "0", body.to_owned())
          .await?
      }
      other => other?,
    };
    let text = String::from_utf8_lossy(&resp.body).into_owned();
    if !resp.status.is_success() {
      return Err(CalendarError::ProviderRequest {
        status: resp.status.as_u16(),
        message: text,
      });
    }
    let ms = parse_multistatus(&text);
    let base = resp.final_url.as_str();
    let principal = ms
      .responses
      .first()
      .and_then(|r| r.best_propstat())
      .and_then(|ps| {
        ps.current_user_principal_href
          .as_deref()
          .or(ps.principal_url_href.as_deref())
      })
      .map(|href| resolve_href(href, base))
      .ok_or_else(|| CalendarError::ProviderRequest {
        status: 500,
        message: "CalDAV principal not found.".to_owned(),
      })?;
    Ok((base.to_owned(), principal))
  }
  async fn fetch_calendar_home_set(
    &self,
    client: &mut CaldavClient<'_>,
    principal_url: &str,
  ) -> Result<String, CalendarError> {
    let body = r#"<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-home-set />
  </D:prop>
</D:propfind>"#;
    let resp = client
      .request(webdav_method("PROPFIND"), principal_url, "0", body.to_owned())
      .await?;
    let text = String::from_utf8_lossy(&resp.body).into_owned();
    if !resp.status.is_success() {
      return Err(CalendarError::ProviderRequest {
        status: resp.status.as_u16(),
        message: text,
      });
    }
    let ms = parse_multistatus(&text);
    let base = resp.final_url.as_str();
    ms.responses
      .first()
      .and_then(|r| r.best_propstat())
      .and_then(|ps| ps.calendar_home_set_href.as_deref())
      .map(|href| resolve_href(href, base))
      .ok_or_else(|| CalendarError::ProviderRequest {
        status: 500,
        message: "CalDAV calendar home not found.".to_owned(),
      })
  }
  async fn sync_collection(
    &self,
    client: &mut CaldavClient<'_>,
    calendar_url: &str,
    sync_token: &str,
  ) -> Result<CalendarProviderListEventsResult, CalendarError> {
    let body = format!(
      r#"<?xml version="1.0" encoding="UTF-8"?>
<D:sync-collection xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:sync-token>{}</D:sync-token>
  <D:sync-level>1</D:sync-level>
  <D:prop>
    <D:getetag />
    <C:calendar-data />
  </D:prop>
</D:sync-collection>"#,
      escape_xml(sync_token)
    );
    let resp = client.request(webdav_method("REPORT"), calendar_url, "1", body).await?;
    let text = String::from_utf8_lossy(&resp.body).into_owned();
    if !resp.status.is_success() {
      return Err(CalendarError::ProviderRequest {
        status: resp.status.as_u16(),
        message: text,
      });
    }
    let ms = parse_multistatus(&text);
    let mut events = Vec::new();
    for item in ms.responses {
      let Some(href) = item.href.as_deref() else {
        continue;
      };
      if item.is_not_found() {
        events.push(CalendarProviderEvent {
          id: resolve_href(href, calendar_url),
          status: Some("cancelled".to_owned()),
          etag: None,
          summary: None,
          description: None,
          location: None,
          updated: None,
          recurring_event_id: None,
          original_start_time: None,
          start: CalendarProviderEventTime {
            date_time: Some("1970-01-01T00:00:00.000Z".to_owned()),
            date: None,
            time_zone: None,
          },
          end: CalendarProviderEventTime {
            date_time: Some("1970-01-01T00:00:00.000Z".to_owned()),
            date: None,
            time_zone: None,
          },
          raw: CalendarProviderEventRaw::Json(json!({ "href": href })),
        });
        continue;
      }
      let Some(ps) = item.best_propstat() else {
        continue;
      };
      let Some(calendar_data) = ps.calendar_data.as_deref() else {
        continue;
      };
      events.extend(try_parse_ical_events(
        calendar_data,
        &resolve_href(href, calendar_url),
        ps.getetag.as_deref(),
      )?);
    }
    Ok(CalendarProviderListEventsResult {
      events,
      next_sync_token: ms.sync_token,
    })
  }
  async fn calendar_query(
    &self,
    client: &mut CaldavClient<'_>,
    calendar_url: &str,
    time_min: Option<&str>,
    time_max: Option<&str>,
  ) -> Result<CalendarProviderListEventsResult, CalendarError> {
    let time_range = match (time_min, time_max) {
      (Some(min), Some(max)) => format!(
        r#"<C:time-range start="{}" end="{}" />"#,
        format_utc_for_ical(min),
        format_utc_for_ical(max)
      ),
      _ => String::new(),
    };
    let body = format!(
      r#"<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag />
    <C:calendar-data />
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        {time_range}
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>"#
    );
    let resp = client.request(webdav_method("REPORT"), calendar_url, "1", body).await?;
    let text = String::from_utf8_lossy(&resp.body).into_owned();
    if !resp.status.is_success() {
      return Err(CalendarError::ProviderRequest {
        status: resp.status.as_u16(),
        message: text,
      });
    }
    let ms = parse_multistatus(&text);
    let mut events = Vec::new();
    for item in ms.responses {
      let Some(href) = item.href.as_deref() else {
        continue;
      };
      let Some(ps) = item.best_propstat() else {
        continue;
      };
      let Some(calendar_data) = ps.calendar_data.as_deref() else {
        continue;
      };
      events.extend(try_parse_ical_events(
        calendar_data,
        &resolve_href(href, calendar_url),
        ps.getetag.as_deref(),
      )?);
    }
    Ok(CalendarProviderListEventsResult {
      events,
      next_sync_token: None,
    })
  }
}
#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn md5_matches_rfc1321_vectors() {
    assert_eq!(md5_hex(b""), "d41d8cd98f00b204e9800998ecf8427e");
    assert_eq!(md5_hex(b"abc"), "900150983cd24fb0d6963f7d28e17f72");
    assert_eq!(md5_hex(b"message digest"), "f96b697d7cb7938d525a2f31aaf161d0");
  }
}
