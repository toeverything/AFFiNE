//! REST transport modules for setup, auth, avatars, and workspace blobs.

pub mod auth;
pub mod blobs;

use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use server_domain::auth::AuthRequestSource;
use server_domain::auth::access_token::{AccessTokenErrorCode, is_likely_jwt};
use server_domain::users::CurrentUserView;
use server_types::DomainError;

use crate::RouterState;
use crate::legacy_compat::errors::{LegacyErrorEnvelope, domain_error_to_envelope};

pub const CSRF_COOKIE_NAME: &str = "affine_csrf_token";
pub const SESSION_COOKIE_NAME: &str = "affine_session";
pub const USER_ID_COOKIE_NAME: &str = "affine_user_id";

const TRUSTED_REDIRECT_DOMAINS: &[&str] = &[
  "google.com",
  "stripe.com",
  "github.com",
  "twitter.com",
  "discord.gg",
  "youtube.com",
  "t.me",
  "reddit.com",
  "affine.pro",
];

const DANGEROUS_INLINE_MIME_PREFIXES: &[&str] = &[
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "application/xml",
  "text/xml",
  "text/javascript",
];

#[derive(Clone, Debug)]
pub enum RequestPrincipal {
  Cookie {
    user: CurrentUserView,
    session_id: String,
  },
  Bearer {
    user: CurrentUserView,
    session_id: String,
    auth_session_id: String,
  },
}

impl RequestPrincipal {
  pub fn user(&self) -> &CurrentUserView {
    match self {
      Self::Cookie { user, .. } | Self::Bearer { user, .. } => user,
    }
  }

  pub fn into_user(self) -> CurrentUserView {
    match self {
      Self::Cookie { user, .. } | Self::Bearer { user, .. } => user,
    }
  }
}

pub enum PrincipalResolutionError {
  AccessToken(AccessTokenErrorCode),
  Domain(DomainError),
}

impl PrincipalResolutionError {
  pub fn into_http_response(self) -> Response {
    match self {
      Self::AccessToken(code) => envelope_to_http_response(LegacyErrorEnvelope {
        status: StatusCode::UNAUTHORIZED.as_u16(),
        code: code.as_code().to_owned(),
        error_type: "AUTHENTICATION_REQUIRED".into(),
        name: code.as_name().to_owned(),
        message: format!("Authentication failed ({}).", code.as_code()),
        data: None,
      }),
      Self::Domain(err) => domain_error_to_http_response(&err),
    }
  }
}

pub fn json_utf8_response(status: StatusCode, body: impl Serialize, no_store: bool) -> Response {
  let bytes = serde_json::to_vec(&body).unwrap_or_else(|_| b"{}".to_vec());
  let mut resp = (status, bytes).into_response();
  let h = resp.headers_mut();
  h.insert(
    header::CONTENT_TYPE,
    HeaderValue::from_static("application/json; charset=utf-8"),
  );
  h.insert(
    header::ACCESS_CONTROL_ALLOW_CREDENTIALS,
    HeaderValue::from_static("true"),
  );
  if no_store {
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
  }
  resp
}

pub fn envelope_to_http_response(env: LegacyErrorEnvelope) -> Response {
  let status = StatusCode::from_u16(env.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
  json_utf8_response(status, env, false)
}

pub fn domain_error_to_http_response(err: &DomainError) -> Response {
  envelope_to_http_response(domain_error_to_envelope(err))
}

pub fn parse_cookies(headers: &HeaderMap) -> Vec<(String, String)> {
  let mut out = Vec::new();
  for val in headers.get_all(header::COOKIE) {
    let Ok(s) = val.to_str() else {
      continue;
    };
    for part in s.split(';') {
      let part = part.trim();
      if part.is_empty() {
        continue;
      }
      if let Some((k, v)) = part.split_once('=') {
        out.push((k.trim().to_owned(), v.trim().to_owned()));
      }
    }
  }
  out
}

pub fn extract_cookie<'a>(cookies: &'a [(String, String)], name: &str) -> Option<&'a str> {
  cookies
    .iter()
    .find(|(k, _)| k == name)
    .map(|(_, v)| v.as_str())
    .filter(|v| !v.is_empty())
}

pub fn extract_bearer_token(headers: &HeaderMap) -> Option<&str> {
  let raw = headers.get(header::AUTHORIZATION)?.to_str().ok()?.trim();
  let (scheme, token) = raw.split_once(char::is_whitespace)?;
  if !scheme.eq_ignore_ascii_case("bearer") {
    return None;
  }
  let token = token.trim();
  if token.is_empty() { None } else { Some(token) }
}

/// Resolves the authenticated principal from `Authorization: Bearer <jwt>` or
/// `affine_session` cookie, matching `v0.27.5` `core/auth/guard.ts` 1:1.
///
/// Explicitly rejects passing a cookie `session_id` UUID as a Bearer token.
pub(crate) async fn resolve_request_principal(
  state: &RouterState,
  headers: &HeaderMap,
) -> Result<Option<RequestPrincipal>, PrincipalResolutionError> {
  if let Some(bearer) = extract_bearer_token(headers)
    && is_likely_jwt(bearer)
  {
    let principal = state
      .app
      .auth
      .resolve_bearer_principal(bearer)
      .await
      .map_err(|err| match err {
        server_domain::auth::BearerResolutionError::Token(code) => PrincipalResolutionError::AccessToken(code),
        server_domain::auth::BearerResolutionError::Domain(dom) => PrincipalResolutionError::Domain(dom),
      })?;
    return Ok(Some(RequestPrincipal::Bearer {
      user: principal.user,
      session_id: principal.session_id,
      auth_session_id: principal.auth_session_id,
    }));
  }

  let cookies = parse_cookies(headers);
  let Some(session_id) = extract_cookie(&cookies, SESSION_COOKIE_NAME) else {
    return Ok(None);
  };
  let user_id = extract_cookie(&cookies, USER_ID_COOKIE_NAME);
  let resolved = state
    .app
    .auth
    .resolve_cookie_principal(session_id, user_id, None, false)
    .await
    .map_err(PrincipalResolutionError::Domain)?;

  Ok(resolved.map(|p| RequestPrincipal::Cookie {
    user: p.user,
    session_id: p.session_id,
  }))
}

fn build_allowed_origins(external_url: &str, server_hosts: &[String]) -> Vec<String> {
  let mut out = Vec::new();
  if let Ok(parsed) = url::Url::parse(external_url) {
    let scheme = parsed.scheme().to_owned();
    out.push(parsed.origin().ascii_serialization());
    for host in server_hosts {
      let host = host.trim().trim_end_matches('/');
      if host.is_empty() {
        continue;
      }
      if host.starts_with("http://") || host.starts_with("https://") {
        out.push(host.to_owned());
      } else {
        out.push(format!("{scheme}://{host}"));
      }
    }
  }
  out
}

fn parse_http_url_with_base(input: &str, base_url: &str) -> Result<url::Url, DomainError> {
  let trimmed = input.trim();
  if trimmed.is_empty() || trimmed.chars().any(char::is_control) {
    return Err(DomainError::Forbidden("URL is not allowed".to_owned()));
  }
  if trimmed.starts_with("//") || trimmed.starts_with("/\\") {
    return Err(DomainError::Forbidden("URL is not allowed".to_owned()));
  }
  let base = url::Url::parse(base_url).map_err(|_| DomainError::Forbidden("URL is not allowed".to_owned()))?;
  let parsed = base
    .join(trimmed)
    .map_err(|_| DomainError::Forbidden("URL is not allowed".to_owned()))?;
  if !matches!(parsed.scheme(), "http" | "https") || !parsed.username().is_empty() || parsed.password().is_some() {
    return Err(DomainError::Forbidden("URL is not allowed".to_owned()));
  }
  Ok(parsed)
}

fn has_allowed_origin(url: &url::Url, allowed_origins: &[String]) -> bool {
  allowed_origins.iter().any(|origin| {
    url::Url::parse(origin)
      .ok()
      .is_some_and(|allowed| matches!(allowed.scheme(), "http" | "https") && url.origin() == allowed.origin())
  })
}

fn matches_trusted_redirect_domain(url: &url::Url) -> bool {
  let Some(hostname) = url.host_str() else {
    return false;
  };
  let hostname = hostname.trim_end_matches('.');
  TRUSTED_REDIRECT_DOMAINS.iter().any(|domain| {
    hostname.eq_ignore_ascii_case(domain) || hostname.to_ascii_lowercase().ends_with(&format!(".{domain}"))
  })
}

pub fn validate_and_build_magic_link_callback_url(
  callback_url: &str,
  external_url: &str,
  server_hosts: &[String],
) -> Result<String, DomainError> {
  let allowed_origins = build_allowed_origins(external_url, server_hosts);
  let mut parsed = parse_http_url_with_base(callback_url, external_url)?;
  if !has_allowed_origin(&parsed, &allowed_origins) {
    return Err(DomainError::Forbidden("callbackUrl origin is not allowed".to_owned()));
  }

  let existing_pairs: Vec<(String, String)> = parsed
    .query_pairs()
    .map(|(k, v)| (k.into_owned(), v.into_owned()))
    .collect();
  if existing_pairs.iter().any(|(k, _)| k == "redirect_uri") {
    let mut normalized_pairs = Vec::with_capacity(existing_pairs.len());
    for (k, v) in existing_pairs {
      if k == "redirect_uri" {
        let redirect_url = parse_http_url_with_base(&v, external_url)?;
        if !has_allowed_origin(&redirect_url, &allowed_origins) && !matches_trusted_redirect_domain(&redirect_url) {
          return Err(DomainError::Forbidden("redirect_uri is not allowed".to_owned()));
        }
        normalized_pairs.push((k, redirect_url.into()));
      } else {
        normalized_pairs.push((k, v));
      }
    }
    parsed.query_pairs_mut().clear().extend_pairs(normalized_pairs);
  }

  Ok(parsed.into())
}

pub fn extract_request_source(headers: &HeaderMap, trusted_cloudflare_headers: bool) -> AuthRequestSource {
  if !trusted_cloudflare_headers {
    return AuthRequestSource {
      trusted: false,
      ip: None,
      asn: None,
    };
  }
  let ip = headers
    .get("cf-connecting-ip")
    .and_then(|v| v.to_str().ok())
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(str::to_owned)
    .or_else(|| {
      headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|raw| raw.split(',').next())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
    });
  let asn = headers
    .get("x-affine-cf-asn")
    .and_then(|v| v.to_str().ok())
    .and_then(|s| s.trim().parse::<u32>().ok())
    .filter(|&v| v > 0);
  AuthRequestSource { trusted: true, ip, asn }
}

fn percent_encode_rfc5987(input: &str) -> String {
  let mut out = String::with_capacity(input.len());
  for b in input.bytes() {
    let safe = b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~');
    if safe {
      out.push(b as char);
    } else {
      use std::fmt::Write as _;
      let _ = write!(&mut out, "%{b:02X}");
    }
  }
  out
}

pub fn apply_blob_security_headers(headers: &mut HeaderMap, content_type: Option<&str>, filename: Option<&str>) {
  headers.insert(header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
  headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("private, no-store"));

  if let Some(ct) = content_type {
    let lower = ct.trim().to_ascii_lowercase();
    if DANGEROUS_INLINE_MIME_PREFIXES.iter().any(|p| lower.starts_with(p)) {
      let safe_name: String = filename
        .unwrap_or("download")
        .chars()
        .filter(|c| !matches!(c, '\r' | '\n'))
        .map(|c| {
          if c.is_ascii_alphanumeric() || matches!(c, '_' | ' ' | '.' | '-') {
            c
          } else {
            '_'
          }
        })
        .collect();
      let safe_name = if safe_name.is_empty() {
        "download".to_owned()
      } else {
        safe_name
      };
      let encoded = percent_encode_rfc5987(&safe_name);
      let disposition = format!("attachment; filename=\"{encoded}\"; filename*=UTF-8''{encoded}");
      if let Ok(val) = HeaderValue::from_str(&disposition) {
        headers.insert(header::CONTENT_DISPOSITION, val);
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn magic_link_callback_url_resolves_relative_normalizes_redirect_uri_and_blocks_untrusted() {
    let ext = "http://affine.parity.test";
    let hosts: Vec<String> = vec![];
    assert_eq!(
      validate_and_build_magic_link_callback_url("/magic-link", ext, &hosts).unwrap(),
      "http://affine.parity.test/magic-link"
    );
    assert_eq!(
      validate_and_build_magic_link_callback_url("/magic-link?redirect_uri=%2Fworkspace%2Fdemo", ext, &hosts).unwrap(),
      "http://affine.parity.test/magic-link?redirect_uri=http%3A%2F%2Faffine.parity.test%2Fworkspace%2Fdemo"
    );
    for bad in [
      "//evil.example/steal",
      "/\\evil.example/steal",
      "https://evil.example/steal",
      "http://user:pass@affine.parity.test/magic-link",
      "javascript:alert(1)",
      "/bad\r\nheader",
      "/magic-link?redirect_uri=https%3A%2F%2Fevil.example%2Fphish",
    ] {
      assert!(matches!(
        validate_and_build_magic_link_callback_url(bad, ext, &hosts),
        Err(DomainError::Forbidden(_))
      ));
    }
  }

  #[test]
  fn extract_request_source_matches_v0275_trusted_cloudflare_policy() {
    let mut headers = HeaderMap::new();
    headers.insert("cf-connecting-ip", HeaderValue::from_static("1.2.3.4"));
    headers.insert("x-affine-cf-asn", HeaderValue::from_static("13335"));
    assert_eq!(
      extract_request_source(&headers, false),
      AuthRequestSource {
        trusted: false,
        ip: None,
        asn: None,
      }
    );
    assert_eq!(
      extract_request_source(&headers, true),
      AuthRequestSource {
        trusted: true,
        ip: Some("1.2.3.4".into()),
        asn: Some(13335),
      }
    );
  }

  #[test]
  fn apply_blob_security_headers_forces_attachment_for_dangerous_inline_mimes() {
    let mut h = HeaderMap::new();
    apply_blob_security_headers(&mut h, Some("image/svg+xml"), Some("logo.svg"));
    assert_eq!(h.get(header::X_CONTENT_TYPE_OPTIONS).unwrap(), "nosniff");
    assert_eq!(h.get(header::CACHE_CONTROL).unwrap(), "private, no-store");
    assert!(
      h.get(header::CONTENT_DISPOSITION)
        .unwrap()
        .to_str()
        .unwrap()
        .starts_with("attachment;")
    );
  }
}
