//! Outbound HTTP SSRF guard with DNS pinning, per-hop redirect validation,
//! cross-origin safe-header allowlisting, and streaming response size limits.

use std::io;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::sync::Arc;
use std::time::{Duration, Instant};

use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::header::{ACCEPT, ACCEPT_LANGUAGE, CONTENT_LENGTH, CONTENT_TYPE, HOST, HeaderMap, LOCATION, USER_AGENT};
use reqwest::{Client, Method, StatusCode, redirect};
use url::{Host, Origin, Url};

/// Default maximum redirect hops followed by [`safe_fetch`].
pub const DEFAULT_MAX_REDIRECTS: usize = 5;
/// Default TCP + TLS connect timeout.
pub const DEFAULT_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// Default total request timeout across all redirects and body streaming.
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);
/// Default maximum response body size in bytes (10 MiB).
pub const DEFAULT_MAX_RESPONSE_BYTES: usize = 10 * 1024 * 1024;

/// Policy governing an outbound [`safe_fetch`] call.
#[derive(Clone, Debug)]
pub struct SafeFetchPolicy {
  /// Allow plain `http://` URLs. Defaults to `false` (`https://` only).
  pub allow_http: bool,
  /// Optional host allowlist. Empty means any public host is allowed.
  /// Both `example.com` and `*.example.com` match `example.com` and its subdomains.
  pub allowed_hosts: Vec<String>,
  /// Administrator-configured origins permitted to resolve to private IPs.
  /// Applies only when the target URL has an exact matching [`Origin`].
  pub allow_private_origins: Vec<Origin>,
  /// Allow replaying a non-empty request body on cross-origin `307`/`308`
  /// redirects. Defaults to `false` (fail-closed).
  pub allow_cross_origin_body_replay: bool,
  /// Maximum number of `301/302/303/307/308` redirects to follow.
  /// Set to `0` to forbid all redirects.
  pub max_redirects: usize,
  /// Maximum duration to establish a connection per hop.
  pub connect_timeout: Duration,
  /// Total end-to-end deadline across DNS, redirects, and body reads.
  pub timeout: Duration,
  /// Maximum response body size in bytes.
  pub max_response_bytes: usize,
}

impl Default for SafeFetchPolicy {
  fn default() -> Self {
    Self {
      allow_http: false,
      allowed_hosts: Vec::new(),
      allow_private_origins: Vec::new(),
      allow_cross_origin_body_replay: false,
      max_redirects: DEFAULT_MAX_REDIRECTS,
      connect_timeout: DEFAULT_CONNECT_TIMEOUT,
      timeout: DEFAULT_TIMEOUT,
      max_response_bytes: DEFAULT_MAX_RESPONSE_BYTES,
    }
  }
}

/// Outbound HTTP request executed through [`safe_fetch`].
#[derive(Clone, Debug)]
pub struct SafeFetchRequest {
  pub method: Method,
  pub url: String,
  pub headers: HeaderMap,
  pub body: Option<Vec<u8>>,
  pub policy: SafeFetchPolicy,
}

impl SafeFetchRequest {
  /// Creates a `GET` request with the default strict [`SafeFetchPolicy`].
  pub fn get(url: impl Into<String>) -> Self {
    Self {
      method: Method::GET,
      url: url.into(),
      headers: HeaderMap::new(),
      body: None,
      policy: SafeFetchPolicy::default(),
    }
  }

  /// Replaces the request policy.
  pub fn with_policy(mut self, policy: SafeFetchPolicy) -> Self {
    self.policy = policy;
    self
  }

  /// Replaces the request headers.
  pub fn with_headers(mut self, headers: HeaderMap) -> Self {
    self.headers = headers;
    self
  }
}

/// Bounded HTTP response returned by [`safe_fetch`].
#[derive(Clone, Debug)]
pub struct SafeFetchResponse {
  pub status: StatusCode,
  pub final_url: Url,
  pub headers: HeaderMap,
  pub body: Vec<u8>,
}

/// Errors returned by [`safe_fetch`] and its URL/IP validation helpers.
#[derive(Debug, thiserror::Error)]
pub enum SafeFetchError {
  #[error("invalid URL: {0}")]
  InvalidUrl(String),
  #[error("URL scheme is not allowed: {0}")]
  SchemeNotAllowed(String),
  #[error("URL credentials are not allowed")]
  CredentialsNotAllowed,
  #[error("URL host is not allowed: {0}")]
  HostNotAllowed(String),
  #[error("resolved IP {ip} for host {host} is blocked")]
  BlockedIp { host: String, ip: IpAddr },
  #[error("DNS resolution failed for host {host}: {message}")]
  DnsResolutionFailed { host: String, message: String },
  #[error("redirect limit exceeded (max {max_redirects})")]
  TooManyRedirects { max_redirects: usize },
  #[error("invalid redirect location: {0}")]
  InvalidRedirectLocation(String),
  #[error("cross-origin redirect refused to replay request body")]
  CrossOriginBodyReplayBlocked,
  #[error("response body ({received_bytes} bytes) exceeds limit of {limit_bytes} bytes")]
  ResponseTooLarge { limit_bytes: usize, received_bytes: usize },
  #[error("outbound request timed out")]
  Timeout,
  #[error("outbound HTTP request failed: {0}")]
  RequestFailed(String),
}

impl SafeFetchError {
  /// Returns the canonical `v0.27.5` `ssrf.ts` block reason when this error
  /// represents an SSRF policy denial.
  pub fn ssrf_reason(&self) -> Option<&'static str> {
    match self {
      Self::InvalidUrl(_) | Self::InvalidRedirectLocation(_) => Some("invalid_url"),
      Self::SchemeNotAllowed(_) => Some("disallowed_protocol"),
      Self::CredentialsNotAllowed => Some("url_has_credentials"),
      Self::HostNotAllowed(_) => Some("host_not_allowed"),
      Self::DnsResolutionFailed { .. } => Some("unresolvable_hostname"),
      Self::BlockedIp { .. } => Some("blocked_ip"),
      Self::TooManyRedirects { .. } => Some("too_many_redirects"),
      Self::CrossOriginBodyReplayBlocked => Some("cross_origin_body_replay"),
      Self::ResponseTooLarge { .. } | Self::Timeout | Self::RequestFailed(_) => None,
    }
  }
}

/// Strict per-hop DNS resolver that serves only pre-validated addresses and
/// refuses to fall back to the system resolver.
struct PinnedDnsResolver {
  host: String,
  addrs: Vec<SocketAddr>,
}

impl Resolve for PinnedDnsResolver {
  fn resolve(&self, name: Name) -> Resolving {
    let expected = self.host.clone();
    let addrs = self.addrs.clone();
    Box::pin(async move {
      let requested = name.as_str().trim_end_matches('.');
      if requested.eq_ignore_ascii_case(expected.trim_end_matches('.')) {
        let iter: Addrs = Box::new(addrs.into_iter());
        Ok(iter)
      } else {
        Err(Box::new(io::Error::new(
          io::ErrorKind::PermissionDenied,
          format!("unpinned DNS lookup blocked for {requested}"),
        )) as Box<dyn std::error::Error + Send + Sync>)
      }
    })
  }
}

/// Returns `true` if `ip` is not a globally routable unicast address.
pub fn is_blocked_ip(ip: IpAddr) -> bool {
  match ip {
    IpAddr::V4(v4) => is_blocked_ipv4(v4),
    IpAddr::V6(v6) => is_blocked_ipv6(v6),
  }
}

fn is_blocked_ipv4(ip: Ipv4Addr) -> bool {
  let [a, b, c, _d] = ip.octets();
  if a == 0 || a == 10 || a == 127 || a >= 224 {
    return true;
  }
  if a == 100 && (b & 0xc0) == 64 {
    return true;
  }
  if a == 169 && b == 254 {
    return true;
  }
  if a == 172 && (16..=31).contains(&b) {
    return true;
  }
  if a == 192 && b == 0 && (c == 0 || c == 2) {
    return true;
  }
  if a == 192 && b == 88 && c == 99 {
    return true;
  }
  if a == 192 && b == 168 {
    return true;
  }
  if a == 198 && (b == 18 || b == 19) {
    return true;
  }
  if a == 198 && b == 51 && c == 100 {
    return true;
  }
  if a == 203 && b == 0 && c == 113 {
    return true;
  }
  false
}

fn is_blocked_ipv6(ip: Ipv6Addr) -> bool {
  let segments = ip.segments();
  if (segments[0] & 0xe000) != 0x2000 {
    return true;
  }
  if segments[0] == 0x2001 && segments[1] == 0x0db8 {
    return true;
  }
  if segments[0] == 0x2001 && segments[1] == 0x0002 && segments[2] == 0x0000 {
    return true;
  }
  if segments[0] == 0x2001 && segments[1] == 0x0000 {
    return true;
  }
  if segments[0] == 0x2001 && ((segments[1] & 0xfff0) == 0x0010 || (segments[1] & 0xfff0) == 0x0020) {
    return true;
  }
  if segments[0] == 0x2002 {
    return true;
  }
  false
}

/// Checks whether `host` matches any entry in `allowed_hosts`.
pub fn is_allowed_host(host: &str, allowed_hosts: &[String]) -> bool {
  if allowed_hosts.is_empty() {
    return true;
  }
  let normalized_host = host.trim().trim_end_matches('.').to_ascii_lowercase();
  if normalized_host.is_empty() {
    return false;
  }
  allowed_hosts.iter().any(|pattern| {
    let normalized = pattern.trim().trim_end_matches('.').to_ascii_lowercase();
    if normalized.is_empty() {
      return false;
    }
    let suffix = normalized.strip_prefix("*.").unwrap_or(&normalized);
    if suffix.is_empty() {
      return false;
    }
    normalized_host == suffix || normalized_host.ends_with(&format!(".{suffix}"))
  })
}

/// Validates the URL scheme, userinfo, and host allowlist against `policy`.
pub fn validate_url_policy(url: &Url, policy: &SafeFetchPolicy) -> Result<(), SafeFetchError> {
  match url.scheme() {
    "https" => {}
    "http" if policy.allow_http => {}
    other => return Err(SafeFetchError::SchemeNotAllowed(other.to_owned())),
  }
  if !url.username().is_empty() || url.password().is_some() {
    return Err(SafeFetchError::CredentialsNotAllowed);
  }
  let host = url
    .host_str()
    .ok_or_else(|| SafeFetchError::InvalidUrl("URL is missing a host".to_owned()))?;
  if !is_allowed_host(host, &policy.allowed_hosts) {
    return Err(SafeFetchError::HostNotAllowed(host.to_owned()));
  }
  Ok(())
}

fn private_ip_allowed_for_url(url: &Url, policy: &SafeFetchPolicy) -> bool {
  let origin = url.origin();
  policy.allow_private_origins.contains(&origin)
}

async fn resolve_and_validate_addrs(
  url: &Url,
  policy: &SafeFetchPolicy,
  remaining: Duration,
) -> Result<(Option<String>, Vec<SocketAddr>), SafeFetchError> {
  let port = url
    .port_or_known_default()
    .ok_or_else(|| SafeFetchError::InvalidUrl("URL has no default port".to_owned()))?;
  let allow_private = private_ip_allowed_for_url(url, policy);

  let (domain_to_pin, addrs) = match url.host() {
    Some(Host::Ipv4(v4)) => (None, vec![SocketAddr::new(IpAddr::V4(v4), port)]),
    Some(Host::Ipv6(v6)) => (None, vec![SocketAddr::new(IpAddr::V6(v6), port)]),
    Some(Host::Domain(domain)) => {
      let resolved = tokio::time::timeout(remaining, tokio::net::lookup_host((domain, port)))
        .await
        .map_err(|_| SafeFetchError::Timeout)?
        .map_err(|err| SafeFetchError::DnsResolutionFailed {
          host: domain.to_owned(),
          message: err.to_string(),
        })?;
      let addrs: Vec<SocketAddr> = resolved.collect();
      if addrs.is_empty() {
        return Err(SafeFetchError::DnsResolutionFailed {
          host: domain.to_owned(),
          message: "DNS returned no addresses".to_owned(),
        });
      }
      (Some(domain.to_owned()), addrs)
    }
    None => return Err(SafeFetchError::InvalidUrl("URL is missing a host".to_owned())),
  };

  let host_display = url.host_str().unwrap_or_default();
  if !allow_private {
    for addr in &addrs {
      if is_blocked_ip(addr.ip()) {
        return Err(SafeFetchError::BlockedIp {
          host: host_display.to_owned(),
          ip: addr.ip(),
        });
      }
    }
  }

  Ok((domain_to_pin, addrs))
}

fn is_redirect_status(status: StatusCode) -> bool {
  matches!(
    status,
    StatusCode::MOVED_PERMANENTLY
      | StatusCode::FOUND
      | StatusCode::SEE_OTHER
      | StatusCode::TEMPORARY_REDIRECT
      | StatusCode::PERMANENT_REDIRECT
  )
}

fn retain_cross_origin_safe_headers(headers: &mut HeaderMap, preserve_body_headers: bool) {
  let mut filtered = HeaderMap::new();
  for name in [ACCEPT, ACCEPT_LANGUAGE, USER_AGENT] {
    for val in headers.get_all(&name) {
      filtered.append(name.clone(), val.clone());
    }
  }
  if preserve_body_headers {
    for name in [CONTENT_TYPE, CONTENT_LENGTH] {
      for val in headers.get_all(&name) {
        filtered.append(name.clone(), val.clone());
      }
    }
  }
  *headers = filtered;
}

fn remaining_budget(deadline: Instant) -> Result<Duration, SafeFetchError> {
  deadline
    .checked_duration_since(Instant::now())
    .filter(|d| !d.is_zero())
    .ok_or(SafeFetchError::Timeout)
}

/// Executes an outbound HTTP request with SSRF IP blocking, strict DNS pinning,
/// per-hop redirect revalidation, cross-origin safe-header allowlisting, and
/// streaming response size enforcement.
pub async fn safe_fetch(request: SafeFetchRequest) -> Result<SafeFetchResponse, SafeFetchError> {
  let mut current_url =
    Url::parse(&request.url).map_err(|err| SafeFetchError::InvalidUrl(format!("failed to parse URL: {err}")))?;
  let mut current_method = request.method;
  let mut current_headers = request.headers;
  let mut current_body = request.body;
  let policy = request.policy;
  let deadline = Instant::now() + policy.timeout;
  let mut redirects_followed = 0usize;

  loop {
    validate_url_policy(&current_url, &policy)?;
    let remaining = remaining_budget(deadline)?;
    let (domain_to_pin, addrs) = resolve_and_validate_addrs(&current_url, &policy, remaining).await?;

    let mut client_builder = Client::builder()
      .no_proxy()
      .redirect(redirect::Policy::none())
      .connect_timeout(policy.connect_timeout.min(remaining))
      .timeout(remaining);
    if let Some(domain) = domain_to_pin {
      client_builder = client_builder.dns_resolver(Arc::new(PinnedDnsResolver { host: domain, addrs }));
    }
    let client = client_builder
      .build()
      .map_err(|err| SafeFetchError::RequestFailed(err.to_string()))?;

    let mut req_builder = client
      .request(current_method.clone(), current_url.clone())
      .headers(current_headers.clone());
    if let Some(body) = &current_body {
      req_builder = req_builder.body(body.clone());
    }

    let remaining = remaining_budget(deadline)?;
    let mut response = tokio::time::timeout(remaining, req_builder.send())
      .await
      .map_err(|_| SafeFetchError::Timeout)?
      .map_err(|err| {
        if err.is_timeout() {
          SafeFetchError::Timeout
        } else {
          SafeFetchError::RequestFailed(err.to_string())
        }
      })?;

    let status = response.status();
    if is_redirect_status(status)
      && let Some(location_val) = response.headers().get(LOCATION)
    {
      if redirects_followed >= policy.max_redirects {
        return Err(SafeFetchError::TooManyRedirects {
          max_redirects: policy.max_redirects,
        });
      }
      let location_str = location_val
        .to_str()
        .map_err(|err| SafeFetchError::InvalidRedirectLocation(err.to_string()))?;
      let next_url = current_url
        .join(location_str)
        .map_err(|err| SafeFetchError::InvalidRedirectLocation(err.to_string()))?;

      current_headers.remove(HOST);
      if status == StatusCode::SEE_OTHER
        || ((status == StatusCode::MOVED_PERMANENTLY || status == StatusCode::FOUND) && current_method == Method::POST)
      {
        current_method = Method::GET;
        current_body = None;
        current_headers.remove(CONTENT_LENGTH);
        current_headers.remove(CONTENT_TYPE);
      }
      let cross_origin = next_url.origin() != current_url.origin();
      if cross_origin {
        if current_body.is_some() && !policy.allow_cross_origin_body_replay {
          return Err(SafeFetchError::CrossOriginBodyReplayBlocked);
        }
        retain_cross_origin_safe_headers(
          &mut current_headers,
          policy.allow_cross_origin_body_replay && current_body.is_some(),
        );
      }

      current_url = next_url;
      redirects_followed += 1;
      continue;
    }

    if let Some(declared_len) = response.content_length()
      && declared_len > policy.max_response_bytes as u64
    {
      return Err(SafeFetchError::ResponseTooLarge {
        limit_bytes: policy.max_response_bytes,
        received_bytes: usize::try_from(declared_len).unwrap_or(usize::MAX),
      });
    }

    let response_headers = response.headers().clone();
    let mut body = Vec::new();
    while let Some(chunk) = {
      let remaining = remaining_budget(deadline)?;
      tokio::time::timeout(remaining, response.chunk())
        .await
        .map_err(|_| SafeFetchError::Timeout)?
        .map_err(|err| {
          if err.is_timeout() {
            SafeFetchError::Timeout
          } else {
            SafeFetchError::RequestFailed(err.to_string())
          }
        })?
    } {
      let received_bytes = body.len().saturating_add(chunk.len());
      if received_bytes > policy.max_response_bytes {
        return Err(SafeFetchError::ResponseTooLarge {
          limit_bytes: policy.max_response_bytes,
          received_bytes,
        });
      }
      body.extend_from_slice(&chunk);
    }

    return Ok(SafeFetchResponse {
      status,
      final_url: current_url,
      headers: response_headers,
      body,
    });
  }
}

#[cfg(test)]
mod tests {
  use std::sync::Arc;
  use std::sync::atomic::{AtomicUsize, Ordering};

  use reqwest::header::{AUTHORIZATION, COOKIE, HeaderValue};
  use tokio::io::{AsyncReadExt, AsyncWriteExt};
  use tokio::net::TcpListener;
  use tokio::sync::Mutex;

  use super::*;

  #[test]
  fn ip_blocking_table_covers_private_metadata_and_ipv4_mapped_v6() {
    let cases = [
      ("127.0.0.1", true),
      ("0.0.0.0", true),
      ("10.0.0.1", true),
      ("100.64.0.1", true),
      ("100.127.255.254", true),
      ("169.254.169.254", true),
      ("172.16.0.1", true),
      ("172.31.255.254", true),
      ("192.168.1.1", true),
      ("192.0.2.1", true),
      ("198.18.0.1", true),
      ("198.51.100.1", true),
      ("203.0.113.1", true),
      ("224.0.0.1", true),
      ("255.255.255.255", true),
      ("::1", true),
      ("::", true),
      ("::ffff:127.0.0.1", true),
      ("::ffff:169.254.169.254", true),
      ("::ffff:93.184.216.34", true),
      ("fe80::1", true),
      ("fc00::1", true),
      ("fd00:ec2::254", true),
      ("ff02::1", true),
      ("2001:db8::1", true),
      ("2002:7f00:0001::1", true),
      ("1.1.1.1", false),
      ("8.8.8.8", false),
      ("93.184.216.34", false),
      ("100.63.255.255", false),
      ("100.128.0.1", false),
      ("172.32.0.1", false),
      ("2606:2800:220:1:248:1893:25c8:1946", false),
    ];

    for (raw, expected_blocked) in cases {
      let ip: IpAddr = raw.parse().unwrap_or_else(|e| panic!("parse {raw}: {e}"));
      assert_eq!(is_blocked_ip(ip), expected_blocked, "ip={raw}");
    }
  }

  #[test]
  fn url_policy_checks_scheme_userinfo_and_host_allowlist() {
    let strict = SafeFetchPolicy::default();
    assert_eq!(
      validate_url_policy(&Url::parse("http://example.com").unwrap(), &strict)
        .unwrap_err()
        .ssrf_reason(),
      Some("disallowed_protocol")
    );
    assert_eq!(
      validate_url_policy(&Url::parse("file:///etc/passwd").unwrap(), &strict)
        .unwrap_err()
        .ssrf_reason(),
      Some("disallowed_protocol")
    );
    assert_eq!(
      validate_url_policy(&Url::parse("https://user:pass@example.com").unwrap(), &strict)
        .unwrap_err()
        .ssrf_reason(),
      Some("url_has_credentials")
    );
    assert!(validate_url_policy(&Url::parse("https://example.com").unwrap(), &strict).is_ok());

    let host_policy = SafeFetchPolicy {
      allow_http: true,
      allowed_hosts: vec!["*.caldav.example".to_owned(), "exact.test".to_owned()],
      ..SafeFetchPolicy::default()
    };
    assert!(validate_url_policy(&Url::parse("http://sub.caldav.example/a").unwrap(), &host_policy).is_ok());
    assert!(validate_url_policy(&Url::parse("https://caldav.example/a").unwrap(), &host_policy).is_ok());
    assert!(validate_url_policy(&Url::parse("https://exact.test/a").unwrap(), &host_policy).is_ok());
    assert_eq!(
      validate_url_policy(&Url::parse("https://evil.example/a").unwrap(), &host_policy)
        .unwrap_err()
        .ssrf_reason(),
      Some("host_not_allowed")
    );
  }

  async fn spawn_http_server<F>(handler: F) -> (SocketAddr, tokio::task::JoinHandle<()>)
  where
    F: Fn(String) -> Vec<u8> + Send + Sync + 'static,
  {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind loopback");
    let addr = listener.local_addr().expect("local addr");
    let handler = Arc::new(handler);
    let handle = tokio::spawn(async move {
      loop {
        let Ok((mut socket, _)) = listener.accept().await else {
          break;
        };
        let handler = Arc::clone(&handler);
        tokio::spawn(async move {
          let mut buf = vec![0u8; 8192];
          let Ok(n) = socket.read(&mut buf).await else {
            return;
          };
          if n == 0 {
            return;
          }
          let req = String::from_utf8_lossy(&buf[..n]).into_owned();
          let resp = handler(req);
          let _ = socket.write_all(&resp).await;
          let _ = socket.shutdown().await;
        });
      }
    });
    (addr, handle)
  }

  #[tokio::test]
  async fn safe_fetch_blocks_private_ip_and_localhost_domain_by_default_and_allows_explicit_origin() {
    let (addr, server) = spawn_http_server(|_| b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok".to_vec()).await;
    let ip_url = format!("http://{addr}/hello");
    let domain_url = format!("http://localhost:{}/hello", addr.port());

    // 1. Default policy blocks both literal loopback IP and Host::Domain("localhost").
    for url in [&ip_url, &domain_url] {
      let err = safe_fetch(SafeFetchRequest::get(url).with_policy(SafeFetchPolicy {
        allow_http: true,
        ..SafeFetchPolicy::default()
      }))
      .await
      .unwrap_err();
      assert!(matches!(err, SafeFetchError::BlockedIp { .. }), "url={url} got {err:?}");
      assert_eq!(err.ssrf_reason(), Some("blocked_ip"));
    }

    // 2. Explicit admin allow_private_origins permits exact matching origins (both IP and pinned domain).
    for url in [&ip_url, &domain_url] {
      let allowed_origin = Url::parse(url).unwrap().origin();
      let resp = safe_fetch(SafeFetchRequest::get(url).with_policy(SafeFetchPolicy {
        allow_http: true,
        allow_private_origins: vec![allowed_origin],
        ..SafeFetchPolicy::default()
      }))
      .await
      .unwrap_or_else(|e| panic!("url={url} failed: {e}"));
      assert_eq!(resp.status, StatusCode::OK);
      assert_eq!(resp.body, b"ok");
    }

    server.abort();
  }

  #[tokio::test]
  async fn safe_fetch_blocks_redirect_to_disallowed_private_ip() {
    let (target_addr, target_server) =
      spawn_http_server(|_| b"HTTP/1.1 200 OK\r\nContent-Length: 6\r\n\r\nsecret".to_vec()).await;
    let target_url = format!("http://{target_addr}/secret");
    let (redirect_addr, redirect_server) = spawn_http_server(move |_| {
      format!("HTTP/1.1 302 Found\r\nLocation: {target_url}\r\nContent-Length: 0\r\n\r\n").into_bytes()
    })
    .await;

    let start_url = format!("http://{redirect_addr}/start");
    let start_origin = Url::parse(&start_url).unwrap().origin();
    let err = safe_fetch(SafeFetchRequest::get(&start_url).with_policy(SafeFetchPolicy {
      allow_http: true,
      allow_private_origins: vec![start_origin],
      ..SafeFetchPolicy::default()
    }))
    .await
    .unwrap_err();
    assert!(matches!(err, SafeFetchError::BlockedIp { .. }), "got {err:?}");

    redirect_server.abort();
    target_server.abort();
  }

  #[tokio::test]
  async fn safe_fetch_strips_non_allowlisted_headers_and_blocks_cross_origin_body_replay() {
    // 1. Cross-origin 302 retains only safe allowlist headers (accept, accept-language, user-agent).
    let captured_req = Arc::new(Mutex::new(String::new()));
    let captured_clone = Arc::clone(&captured_req);
    let (target_addr, target_server) = spawn_http_server(move |req| {
      if let Ok(mut guard) = captured_clone.try_lock() {
        *guard = req;
      }
      b"HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\ndone".to_vec()
    })
    .await;
    let target_url = format!("http://{target_addr}/target");
    let target_url_for_302 = target_url.clone();
    let (redirect_addr, redirect_server) = spawn_http_server(move |_| {
      format!("HTTP/1.1 302 Found\r\nLocation: {target_url_for_302}\r\nContent-Length: 0\r\n\r\n").into_bytes()
    })
    .await;

    let start_url = format!("http://{redirect_addr}/start");
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, HeaderValue::from_static("Bearer super-secret"));
    headers.insert(COOKIE, HeaderValue::from_static("session=secret"));
    headers.insert(HOST, HeaderValue::from_static("spoofed.example"));
    headers.insert("x-api-key", HeaderValue::from_static("sk-provider-secret"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers.insert(USER_AGENT, HeaderValue::from_static("affine-test/1.0"));

    let resp = safe_fetch(
      SafeFetchRequest::get(&start_url)
        .with_headers(headers)
        .with_policy(SafeFetchPolicy {
          allow_http: true,
          allow_private_origins: vec![
            Url::parse(&start_url).unwrap().origin(),
            Url::parse(&target_url).unwrap().origin(),
          ],
          ..SafeFetchPolicy::default()
        }),
    )
    .await
    .expect("cross-origin redirect should succeed");

    assert_eq!(resp.status, StatusCode::OK);
    assert_eq!(resp.final_url.as_str(), target_url);
    let received = captured_req.lock().await.to_ascii_lowercase();
    assert!(!received.contains("authorization:"), "leaked Authorization: {received}");
    assert!(!received.contains("cookie:"), "leaked Cookie: {received}");
    assert!(!received.contains("x-api-key:"), "leaked x-api-key: {received}");
    assert!(!received.contains("spoofed.example"), "leaked Host: {received}");
    assert!(
      received.contains("accept: application/json"),
      "missing Accept: {received}"
    );
    assert!(
      received.contains("user-agent: affine-test/1.0"),
      "missing User-Agent: {received}"
    );
    redirect_server.abort();
    target_server.abort();

    // 2. Cross-origin 307/308 with request body is blocked without contacting target.
    for (method, status_line) in [
      (Method::POST, "307 Temporary Redirect"),
      (Method::POST, "308 Permanent Redirect"),
      (Method::PUT, "301 Moved Permanently"),
      (Method::PUT, "302 Found"),
    ] {
      let target_hits = Arc::new(AtomicUsize::new(0));
      let hits_clone = Arc::clone(&target_hits);
      let (t_addr, t_srv) = spawn_http_server(move |_| {
        hits_clone.fetch_add(1, Ordering::SeqCst);
        b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok".to_vec()
      })
      .await;
      let t_url = format!("http://{t_addr}/sink");
      let t_url_clone = t_url.clone();
      let (r_addr, r_srv) = spawn_http_server(move |_| {
        format!("HTTP/1.1 {status_line}\r\nLocation: {t_url_clone}\r\nContent-Length: 0\r\n\r\n").into_bytes()
      })
      .await;
      let s_url = format!("http://{r_addr}/submit");

      let err = safe_fetch(SafeFetchRequest {
        method: method.clone(),
        url: s_url.clone(),
        headers: HeaderMap::new(),
        body: Some(b"secret-token-body".to_vec()),
        policy: SafeFetchPolicy {
          allow_http: true,
          allow_private_origins: vec![
            Url::parse(&s_url).unwrap().origin(),
            Url::parse(&t_url).unwrap().origin(),
          ],
          ..SafeFetchPolicy::default()
        },
      })
      .await
      .unwrap_err();
      assert!(
        matches!(err, SafeFetchError::CrossOriginBodyReplayBlocked),
        "method={method} status={status_line} got {err:?}"
      );
      assert_eq!(
        target_hits.load(Ordering::SeqCst),
        0,
        "method={method} status={status_line} contacted target"
      );

      r_srv.abort();
      t_srv.abort();
    }

    // Opt-in allow_cross_origin_body_replay preserves Content-Type while still stripping Authorization/Cookie.
    let captured = Arc::new(std::sync::Mutex::new(String::new()));
    let captured_clone = Arc::clone(&captured);
    let (t_addr, t_srv) = spawn_http_server(move |req| {
      *captured_clone.lock().unwrap() = req;
      b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok".to_vec()
    })
    .await;
    let t_url = format!("http://{t_addr}/sink");
    let t_url_clone = t_url.clone();
    let (r_addr, r_srv) = spawn_http_server(move |_| {
      format!("HTTP/1.1 307 Temporary Redirect\r\nLocation: {t_url_clone}\r\nContent-Length: 0\r\n\r\n").into_bytes()
    })
    .await;
    let s_url = format!("http://{r_addr}/submit");
    let mut headers = HeaderMap::new();
    headers.insert("authorization", "Bearer top-secret".parse().unwrap());
    headers.insert("cookie", "sid=secret".parse().unwrap());
    headers.insert(CONTENT_TYPE, "application/xml".parse().unwrap());

    let resp = safe_fetch(SafeFetchRequest {
      method: Method::POST,
      url: s_url.clone(),
      headers,
      body: Some(b"<propfind/>".to_vec()),
      policy: SafeFetchPolicy {
        allow_http: true,
        allow_cross_origin_body_replay: true,
        allow_private_origins: vec![
          Url::parse(&s_url).unwrap().origin(),
          Url::parse(&t_url).unwrap().origin(),
        ],
        ..SafeFetchPolicy::default()
      },
    })
    .await
    .expect("opt-in cross-origin body replay should succeed");
    assert_eq!(resp.status, StatusCode::OK);
    let target_req = captured.lock().unwrap().to_ascii_lowercase();
    assert!(
      target_req.contains("content-type: application/xml"),
      "Content-Type must be preserved on opt-in body replay: {target_req}"
    );
    assert!(
      !target_req.contains("authorization:"),
      "Authorization must still be stripped on opt-in body replay: {target_req}"
    );
    assert!(
      !target_req.contains("cookie:"),
      "Cookie must still be stripped on opt-in body replay: {target_req}"
    );
    r_srv.abort();
    t_srv.abort();
  }

  #[tokio::test]
  async fn safe_fetch_enforces_streaming_max_response_bytes_and_zero_redirects() {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let stream_addr = listener.local_addr().expect("addr");
    let stream_server = tokio::spawn(async move {
      let Ok((mut socket, _)) = listener.accept().await else {
        return;
      };
      let mut buf = [0u8; 1024];
      let _ = socket.read(&mut buf).await;
      let _ = socket
        .write_all(b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n")
        .await;
      let chunk = vec![b'a'; 1024];
      for _ in 0..8 {
        let header = format!("{:x}\r\n", chunk.len());
        if socket.write_all(header.as_bytes()).await.is_err() {
          break;
        }
        if socket.write_all(&chunk).await.is_err() {
          break;
        }
        if socket.write_all(b"\r\n").await.is_err() {
          break;
        }
      }
      let _ = socket.write_all(b"0\r\n\r\n").await;
    });

    let stream_url = format!("http://{stream_addr}/large");
    let err = safe_fetch(SafeFetchRequest::get(&stream_url).with_policy(SafeFetchPolicy {
      allow_http: true,
      allow_private_origins: vec![Url::parse(&stream_url).unwrap().origin()],
      max_response_bytes: 2048,
      ..SafeFetchPolicy::default()
    }))
    .await
    .unwrap_err();
    assert!(
      matches!(
        err,
        SafeFetchError::ResponseTooLarge {
          limit_bytes: 2048,
          received_bytes: 3072
        }
      ),
      "got {err:?}"
    );
    stream_server.abort();

    let hits = Arc::new(AtomicUsize::new(0));
    let hits_clone = Arc::clone(&hits);
    let (target_addr, target_server) = spawn_http_server(move |_| {
      hits_clone.fetch_add(1, Ordering::SeqCst);
      b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok".to_vec()
    })
    .await;
    let target_url = format!("http://{target_addr}/next");
    let target_url_clone = target_url.clone();
    let (redirect_addr, redirect_server) = spawn_http_server(move |_| {
      format!("HTTP/1.1 302 Found\r\nLocation: {target_url_clone}\r\nContent-Length: 0\r\n\r\n").into_bytes()
    })
    .await;
    let oidc_url = format!("http://{redirect_addr}/oidc");

    let err = safe_fetch(SafeFetchRequest::get(&oidc_url).with_policy(SafeFetchPolicy {
      allow_http: true,
      allow_private_origins: vec![
        Url::parse(&oidc_url).unwrap().origin(),
        Url::parse(&target_url).unwrap().origin(),
      ],
      max_redirects: 0,
      ..SafeFetchPolicy::default()
    }))
    .await
    .unwrap_err();
    assert!(
      matches!(err, SafeFetchError::TooManyRedirects { max_redirects: 0 }),
      "got {err:?}"
    );
    assert_eq!(hits.load(Ordering::SeqCst), 0, "redirect target must not be contacted");

    redirect_server.abort();
    target_server.abort();
  }
}
