//! REST transport modules for setup, auth, avatars, and workspace blobs.

pub mod auth;
pub mod blobs;
pub mod calendar;
pub mod captcha;
pub mod copilot;
pub mod doc_renderer;
pub mod mcp;
pub mod oauth;
pub mod r2_proxy;
pub mod static_files;
pub mod telemetry;
pub mod throttle;
pub mod version_guard;
pub mod worker_proxy;

use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Utc};
use serde::Serialize;
use server_domain::auth::AuthRequestSource;
use server_domain::auth::access_token::{AccessTokenErrorCode, is_likely_jwt};
use server_domain::users::CurrentUserView;
use server_types::DomainError;
use uuid::Uuid;

use crate::RouterState;
use crate::legacy_compat::errors::{LegacyErrorEnvelope, domain_error_to_envelope};
use crate::rest::version_guard::{
  ClientVersionControlConfig, VersionGuardError, extract_client_version as extract_version_header,
  verify_session_client_version_at,
};

pub const CSRF_COOKIE_NAME: &str = "affine_csrf_token";
pub const SESSION_COOKIE_NAME: &str = "affine_session";
pub const USER_ID_COOKIE_NAME: &str = "affine_user_id";

pub(crate) const TRUSTED_REDIRECT_DOMAINS: &[&str] = &[
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
    sign_in_client_version: Option<String>,
    refresh_client_version: Option<String>,
    refreshed_expires_at: Option<DateTime<Utc>>,
  },
  Bearer {
    user: CurrentUserView,
    session_id: String,
    auth_session_id: String,
    sign_in_client_version: Option<String>,
    refresh_client_version: Option<String>,
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

  pub fn session_id(&self) -> &str {
    match self {
      Self::Cookie { session_id, .. } | Self::Bearer { session_id, .. } => session_id,
    }
  }
}

pub(crate) fn format_http_date(dt: DateTime<Utc>) -> String {
  dt.format("%a, %d %b %Y %H:%M:%S GMT").to_string()
}

pub(crate) fn append_clear_auth_cookies(headers: &mut HeaderMap, https: bool) {
  let expired = "Thu, 01 Jan 1970 00:00:00 GMT";
  let secure_attr = if https { "; Secure" } else { "" };
  let cookies = [
    format!("{SESSION_COOKIE_NAME}=; Path=/; Expires={expired}; HttpOnly; SameSite=Lax{secure_attr}"),
    format!("{USER_ID_COOKIE_NAME}=; Path=/; Expires={expired}; SameSite=Lax{secure_attr}"),
    format!("{CSRF_COOKIE_NAME}=; Path=/; Expires={expired}; SameSite=Lax{secure_attr}"),
  ];
  for cookie in cookies {
    if let Ok(val) = HeaderValue::from_str(&cookie) {
      headers.append(header::SET_COOKIE, val);
    }
  }
}

pub(crate) fn append_refresh_auth_cookies(
  headers: &mut HeaderMap,
  session_id: &str,
  expires_at: DateTime<Utc>,
  https: bool,
) {
  let expires = format_http_date(expires_at);
  let secure_attr = if https { "; Secure" } else { "" };
  let csrf_token = Uuid::new_v4().to_string();
  let cookies = [
    format!("{CSRF_COOKIE_NAME}={csrf_token}; Path=/; Expires={expires}; SameSite=Lax{secure_attr}"),
    format!("{SESSION_COOKIE_NAME}={session_id}; Path=/; Expires={expires}; HttpOnly; SameSite=Lax{secure_attr}"),
  ];
  for cookie in cookies {
    if let Ok(val) = HeaderValue::from_str(&cookie) {
      headers.append(header::SET_COOKIE, val);
    }
  }
}

#[derive(Clone, Debug)]
pub(crate) enum PrincipalCookieAction {
  None,
  Clear,
  SetUserId(String),
  Refresh {
    session_id: String,
    expires_at: DateTime<Utc>,
    sync_user_id: Option<String>,
  },
}

impl PrincipalCookieAction {
  pub(crate) fn apply_to(&self, headers: &mut HeaderMap, https: bool) {
    match self {
      Self::None => {}
      Self::Clear => append_clear_auth_cookies(headers, https),
      Self::SetUserId(uid) => {
        let cookie = format!("{USER_ID_COOKIE_NAME}={uid}; Path=/; SameSite=Lax");
        if let Ok(val) = HeaderValue::from_str(&cookie) {
          headers.append(header::SET_COOKIE, val);
        }
      }
      Self::Refresh {
        session_id,
        expires_at,
        sync_user_id,
      } => {
        append_refresh_auth_cookies(headers, session_id, *expires_at, https);
        if let Some(uid) = sync_user_id {
          let cookie = format!("{USER_ID_COOKIE_NAME}={uid}; Path=/; SameSite=Lax");
          if let Ok(val) = HeaderValue::from_str(&cookie) {
            headers.append(header::SET_COOKIE, val);
          }
        }
      }
    }
  }
}

pub(crate) struct ResolvedRequestPrincipal {
  pub(crate) principal: Option<RequestPrincipal>,
  pub(crate) cookie_action: PrincipalCookieAction,
  pub(crate) rejected_cookie_version: Option<VersionGuardError>,
}

pub enum PrincipalResolutionError {
  AccessToken(AccessTokenErrorCode),
  VersionGuard {
    error: VersionGuardError,
    clear_cookies: bool,
    https: bool,
  },
  Domain(DomainError),
}

impl PrincipalResolutionError {
  pub fn into_envelope(self) -> (LegacyErrorEnvelope, bool) {
    match self {
      Self::AccessToken(code) => {
        let message = match code {
          AccessTokenErrorCode::AccessTokenExpired => "The access token has expired.",
          AccessTokenErrorCode::AccessTokenInvalid => "The access token is invalid.",
          AccessTokenErrorCode::AuthSessionRevoked => "The auth session has been revoked.",
          AccessTokenErrorCode::AuthSessionExpired => "The auth session has expired.",
        };
        (
          LegacyErrorEnvelope {
            status: StatusCode::UNAUTHORIZED.as_u16(),
            code: code.as_code().to_owned(),
            error_type: "AUTHENTICATION_REQUIRED".into(),
            name: code.as_name().to_owned(),
            message: message.to_owned(),
            data: None,
          },
          false,
        )
      }
      Self::VersionGuard {
        error, clear_cookies, ..
      } => (error.into_envelope(), clear_cookies),
      Self::Domain(err) => (domain_error_to_envelope(&err), false),
    }
  }

  pub fn into_http_response(self) -> Response {
    let https = match &self {
      Self::VersionGuard { https, .. } => *https,
      _ => false,
    };
    let (env, clear_cookies) = self.into_envelope();
    let mut resp = envelope_to_http_response(env);
    if clear_cookies {
      append_clear_auth_cookies(resp.headers_mut(), https);
    }
    resp
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
  if no_store {
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
  }
  resp
}

pub fn envelope_to_http_response(env: LegacyErrorEnvelope) -> Response {
  let status = StatusCode::from_u16(env.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
  if status.is_server_error() {
    let request_id = Uuid::new_v4().to_string();
    let mut val = serde_json::to_value(&env).unwrap_or_default();
    if let Some(obj) = val.as_object_mut() {
      obj.insert("requestId".to_owned(), serde_json::Value::String(request_id.clone()));
    }
    let mut resp = json_utf8_response(status, val, false);
    if let Ok(v) = HeaderValue::from_str(&request_id) {
      resp
        .headers_mut()
        .insert(header::HeaderName::from_static("x-request-id"), v);
    }
    return resp;
  }
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

/// Side-effect-free read-only check for whether the request carries a valid
/// Bearer JWT or active Cookie session (without running version-guard
/// revocation or TTR refresh, which belong to the route handler).
pub(crate) async fn has_valid_authenticated_principal(state: &RouterState, headers: &HeaderMap) -> bool {
  if let Some(bearer) = extract_bearer_token(headers).filter(|token| is_likely_jwt(token)) {
    return state.app.auth.resolve_bearer_principal(bearer).await.is_ok();
  }
  let cookies = parse_cookies(headers);
  let Some(session_id) = extract_cookie(&cookies, SESSION_COOKIE_NAME) else {
    return false;
  };
  let user_id = extract_cookie(&cookies, USER_ID_COOKIE_NAME);
  matches!(
    state
      .app
      .auth
      .resolve_cookie_principal(session_id, user_id, None, false)
      .await,
    Ok(Some(_))
  )
}

/// Resolves the authenticated principal from `Authorization: Bearer <jwt>` or
/// `affine_session` cookie, enforcing `client.versionControl` and cookie TTR
/// refresh matching `v0.27.5` `core/auth/guard.ts:85-220` 1:1.
///
/// Anonymous requests (neither a JWT Bearer token nor an `affine_session`
/// cookie) short-circuit immediately with zero database or config lookups.
pub(crate) async fn resolve_request_principal_with_policy(
  state: &RouterState,
  headers: &HeaderMap,
  is_public: bool,
) -> Result<ResolvedRequestPrincipal, PrincipalResolutionError> {
  let bearer_jwt = extract_bearer_token(headers).filter(|token| is_likely_jwt(token));
  let cookies = parse_cookies(headers);
  let session_cookie = extract_cookie(&cookies, SESSION_COOKIE_NAME);

  if bearer_jwt.is_none() && session_cookie.is_none() {
    return Ok(ResolvedRequestPrincipal {
      principal: None,
      cookie_action: PrincipalCookieAction::None,
      rejected_cookie_version: None,
    });
  }

  let allow_canary = state.app.config.load().channel == "canary";
  let (vc_enabled, vc_required) = state
    .app
    .app_config
    .get_client_version_control()
    .await
    .map_err(PrincipalResolutionError::Domain)?;
  let vc_cfg = ClientVersionControlConfig {
    enabled: vc_enabled,
    required_version: vc_required,
  };

  if let Some(bearer) = bearer_jwt {
    let principal = state
      .app
      .auth
      .resolve_bearer_principal(bearer)
      .await
      .map_err(|err| match err {
        server_domain::auth::BearerResolutionError::Token(code) => PrincipalResolutionError::AccessToken(code),
        server_domain::auth::BearerResolutionError::Domain(dom) => PrincipalResolutionError::Domain(dom),
      })?;

    if vc_cfg.enabled
      && let Err(ver_err) = verify_session_client_version_at(
        headers,
        principal.refresh_client_version.as_deref(),
        principal.sign_in_client_version.as_deref(),
        &vc_cfg,
        allow_canary,
        Utc::now(),
      )
    {
      state
        .app
        .auth
        .revoke_auth_session(
          &principal.auth_session_id,
          Some(&principal.user.id),
          "unsupported_client_version",
        )
        .await
        .map_err(PrincipalResolutionError::Domain)?;
      return Err(PrincipalResolutionError::VersionGuard {
        error: ver_err,
        clear_cookies: false,
        https: state.app.config.load().https,
      });
    }

    return Ok(ResolvedRequestPrincipal {
      principal: Some(RequestPrincipal::Bearer {
        user: principal.user,
        session_id: principal.session_id,
        auth_session_id: principal.auth_session_id,
        sign_in_client_version: principal.sign_in_client_version,
        refresh_client_version: principal.refresh_client_version,
      }),
      cookie_action: PrincipalCookieAction::None,
      rejected_cookie_version: None,
    });
  }

  let Some(session_id) = session_cookie else {
    return Ok(ResolvedRequestPrincipal {
      principal: None,
      cookie_action: PrincipalCookieAction::None,
      rejected_cookie_version: None,
    });
  };
  let user_id = extract_cookie(&cookies, USER_ID_COOKIE_NAME);

  // Single lock-free read-only lookup first; only write-refresh when inside TTR.
  let Some(peek) = state
    .app
    .auth
    .resolve_cookie_principal(session_id, user_id, None, false)
    .await
    .map_err(PrincipalResolutionError::Domain)?
  else {
    return Ok(ResolvedRequestPrincipal {
      principal: None,
      cookie_action: PrincipalCookieAction::Clear,
      rejected_cookie_version: None,
    });
  };

  if vc_cfg.enabled
    && let Err(ver_err) = verify_session_client_version_at(
      headers,
      peek.refresh_client_version.as_deref(),
      peek.sign_in_client_version.as_deref(),
      &vc_cfg,
      allow_canary,
      Utc::now(),
    )
  {
    state
      .app
      .auth
      .sign_out_cookie(&peek.session_id, None)
      .await
      .map_err(PrincipalResolutionError::Domain)?;
    if is_public {
      return Ok(ResolvedRequestPrincipal {
        principal: None,
        cookie_action: PrincipalCookieAction::Clear,
        rejected_cookie_version: Some(ver_err),
      });
    }
    return Err(PrincipalResolutionError::VersionGuard {
      error: ver_err,
      clear_cookies: true,
      https: state.app.config.load().https,
    });
  }

  let ttr_window = chrono::Duration::seconds(state.app.auth.session_ttr_seconds().await);
  let in_ttr_window = peek.expires_at.is_none_or(|exp| exp - Utc::now() <= ttr_window);
  let p = if in_ttr_window {
    let header_ver_for_refresh = extract_version_header(headers).filter(|s| !s.is_empty());
    match state
      .app
      .auth
      .resolve_cookie_principal(session_id, user_id, header_ver_for_refresh, true)
      .await
      .map_err(PrincipalResolutionError::Domain)?
    {
      Some(refreshed) => refreshed,
      None => {
        return Ok(ResolvedRequestPrincipal {
          principal: None,
          cookie_action: PrincipalCookieAction::Clear,
          rejected_cookie_version: None,
        });
      }
    }
  } else {
    peek
  };

  let sync_user_id = if user_id != Some(p.user.id.as_str()) {
    Some(p.user.id.clone())
  } else {
    None
  };
  let cookie_action = match p.refreshed_expires_at {
    Some(expires_at) => PrincipalCookieAction::Refresh {
      session_id: p.session_id.clone(),
      expires_at,
      sync_user_id,
    },
    None => match sync_user_id {
      Some(uid) => PrincipalCookieAction::SetUserId(uid),
      None => PrincipalCookieAction::None,
    },
  };

  Ok(ResolvedRequestPrincipal {
    principal: Some(RequestPrincipal::Cookie {
      user: p.user,
      session_id: p.session_id,
      sign_in_client_version: p.sign_in_client_version,
      refresh_client_version: p.refresh_client_version,
      refreshed_expires_at: p.refreshed_expires_at,
    }),
    cookie_action,
    rejected_cookie_version: None,
  })
}

/// Enforces route-level `@UseNamedGuard('version')` on GraphQL-flavor roles
/// (`ServerRole::Graphql | ServerRole::Allinone`), matching `v0.27.5`
/// `app.module.ts:209` and `core/version/guard.ts`.
pub(crate) async fn enforce_named_version_guard(
  state: &RouterState,
  headers: &HeaderMap,
  pending_cookie_action: &PrincipalCookieAction,
) -> Result<(), Box<Response>> {
  let cfg = state.app.config.load();
  if !matches!(
    cfg.role,
    server_types::ServerRole::Graphql | server_types::ServerRole::Allinone
  ) {
    return Ok(());
  }
  let (enabled, required_version) = match state.app.app_config.get_client_version_control().await {
    Ok(v) => v,
    Err(err) => {
      let mut resp = domain_error_to_http_response(&err);
      pending_cookie_action.apply_to(resp.headers_mut(), cfg.https);
      return Err(Box::new(resp));
    }
  };
  if !enabled {
    return Ok(());
  }
  let allow_canary = cfg.channel == "canary";
  if let Err(ver_err) =
    version_guard::verify_client_version_at(headers, Some(&required_version), allow_canary, Utc::now())
  {
    let mut resp = ver_err.into_http_response();
    pending_cookie_action.apply_to(resp.headers_mut(), cfg.https);
    return Err(Box::new(resp));
  }
  Ok(())
}

fn extract_hostname(raw: &str) -> Option<String> {
  let t = raw.trim();
  if t.is_empty() {
    return None;
  }
  if let Some(rest) = t.strip_prefix('[') {
    let inner = rest[..rest.find(']')?].trim();
    return (!inner.is_empty()).then(|| inner.to_owned());
  }
  let h = match t.split_once(':') {
    Some((h, tail)) if !tail.contains(':') => h.trim(),
    _ => t,
  };
  (!h.is_empty()).then(|| h.to_owned())
}
fn convert_host_to_origin(scheme: &str, host: &str, port: Option<u16>) -> String {
  let host = host.trim().trim_end_matches('/');
  if host.starts_with("http://") || host.starts_with("https://") {
    return host.to_owned();
  }
  let is_v6 = host.parse::<std::net::Ipv6Addr>().is_ok();
  let is_local = host.eq_ignore_ascii_case("localhost") || host.parse::<std::net::IpAddr>().is_ok();
  let fmt_host = if is_v6 { format!("[{host}]") } else { host.to_owned() };
  match port {
    Some(p) if p != 0 && is_local => format!("{scheme}://{fmt_host}:{p}"),
    _ => format!("{scheme}://{fmt_host}"),
  }
}
pub(crate) fn build_allowed_origins_with_port(ext: &str, hosts: &[String], port: Option<u16>) -> Vec<String> {
  let Ok(parsed) = url::Url::parse(ext) else {
    return Vec::new();
  };
  let scheme = parsed.scheme();
  std::iter::once(parsed.origin().ascii_serialization())
    .chain(
      hosts
        .iter()
        .map(|h| h.trim().trim_end_matches('/'))
        .filter(|h| !h.is_empty())
        .map(|h| convert_host_to_origin(scheme, h, port)),
    )
    .collect()
}
pub(crate) fn build_allowed_origins(external_url: &str, server_hosts: &[String]) -> Vec<String> {
  build_allowed_origins_with_port(external_url, server_hosts, None)
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

pub(crate) fn calendar_request_origin(
  external_url: &str,
  server_hosts: &[String],
  server_port: u16,
  request_host: Option<&str>,
) -> Option<(String, String)> {
  let ext = url::Url::parse(external_url).ok()?;
  let path = ext.path().trim_end_matches('/').to_owned();
  let origin = if !server_hosts.is_empty()
    && let Some(req_hostname) = request_host.and_then(extract_hostname)
    && let Some(matched) = server_hosts
      .iter()
      .map(|h| h.trim())
      .find(|h| !h.is_empty() && h.eq_ignore_ascii_case(&req_hostname))
  {
    convert_host_to_origin(ext.scheme(), matched, Some(server_port))
  } else {
    ext.origin().ascii_serialization()
  };
  Some((origin, path))
}

pub(crate) fn calendar_callback_origin(
  external_url: &str,
  server_hosts: &[String],
  server_port: u16,
  request_host: Option<&str>,
) -> String {
  calendar_request_origin(external_url, server_hosts, server_port, request_host)
    .map(|(origin, _)| origin)
    .unwrap_or_else(|| external_url.to_owned())
}

pub(crate) fn validate_and_build_calendar_redirect_uri(
  raw: &str,
  external_url: &str,
  server_hosts: &[String],
  server_port: u16,
  request_host: Option<&str>,
  extra_query: &[(&str, &str)],
) -> Result<String, DomainError> {
  let forbid = || DomainError::Forbidden("URL is not allowed".to_owned());
  if raw.is_empty() {
    return Err(forbid());
  }
  let (req_origin, _) =
    calendar_request_origin(external_url, server_hosts, server_port, request_host).ok_or_else(forbid)?;
  let base = url::Url::parse(&req_origin).map_err(|_| forbid())?;
  let mut parsed = base.join(raw).map_err(|_| forbid())?;
  let allowed = build_allowed_origins_with_port(external_url, server_hosts, Some(server_port));
  if !matches!(parsed.scheme(), "http" | "https")
    || !parsed.username().is_empty()
    || parsed.password().is_some()
    || (!has_allowed_origin(&parsed, &allowed) && !matches_trusted_redirect_domain(&parsed))
  {
    return Err(forbid());
  }
  if !extra_query.is_empty() {
    let mut kept: Vec<(String, String)> = parsed
      .query_pairs()
      .filter(|(k, _)| !extra_query.iter().any(|(ek, _)| ek == k))
      .map(|(k, v)| (k.into_owned(), v.into_owned()))
      .collect();
    kept.extend(extra_query.iter().map(|&(k, v)| (k.to_owned(), v.to_owned())));
    parsed.query_pairs_mut().clear().extend_pairs(kept);
  }
  Ok(parsed.into())
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

fn safe_link_forbidden() -> DomainError {
  DomainError::Forbidden("You are not allowed to perform this action.".to_owned())
}

fn parse_safe_link_url(input: &str, base_url: &str) -> Result<url::Url, DomainError> {
  if input.is_empty() {
    return Err(safe_link_forbidden());
  }
  let base = url::Url::parse(base_url).map_err(|_| safe_link_forbidden())?;
  let parsed = base.join(input).map_err(|_| safe_link_forbidden())?;
  if !matches!(parsed.scheme(), "http" | "https") || !parsed.username().is_empty() || parsed.password().is_some() {
    return Err(safe_link_forbidden());
  }
  Ok(parsed)
}

/// Validates ONLY the outer `callbackUrl` origin against allowed origins
/// (matching `v0.27.5` `url.safeLink`, without rewriting inner query parameters).
pub fn validate_safe_link_callback_url(
  callback_url: &str,
  external_url: &str,
  server_hosts: &[String],
) -> Result<String, DomainError> {
  let allowed_origins = build_allowed_origins(external_url, server_hosts);
  let parsed = parse_safe_link_url(callback_url, external_url)?;
  if !has_allowed_origin(&parsed, &allowed_origins) {
    return Err(safe_link_forbidden());
  }
  Ok(parsed.into())
}

pub(crate) fn extract_request_host(headers: Option<&HeaderMap>) -> Option<&str> {
  headers?
    .get(header::HOST)
    .and_then(|v| v.to_str().ok())
    .map(str::trim)
    .filter(|s| !s.is_empty())
}

/// Request-aware `url.safeLink` validation using effective `/server/hosts`,
/// `server_port`, and `host` for multi-host base origin resolution.
pub(crate) async fn validate_safe_link_callback_url_for_request(
  app: &crate::AppState,
  headers: Option<&HeaderMap>,
  callback_url: &str,
) -> Result<String, DomainError> {
  let cfg = app.config.load();
  let effective = app.app_config.get_effective_app_config().await.ok();
  let server_hosts: Vec<String> = effective
    .as_ref()
    .and_then(|v| v.pointer("/server/hosts").and_then(|h| h.as_array()))
    .map(|arr| arr.iter().filter_map(|item| item.as_str().map(str::to_owned)).collect())
    .unwrap_or_else(|| cfg.app_config_baseline.server.hosts.clone());
  let server_port = effective
    .as_ref()
    .and_then(|v| v.pointer("/server/port").and_then(|p| p.as_u64()))
    .and_then(|p| u16::try_from(p).ok())
    .unwrap_or(cfg.app_config_baseline.server.port);
  let request_host = extract_request_host(headers);
  let base_origin = calendar_request_origin(&cfg.external_url, &server_hosts, server_port, request_host)
    .map(|(origin, _)| origin)
    .unwrap_or_else(|| cfg.external_url.clone());
  let allowed_origins = build_allowed_origins_with_port(&cfg.external_url, &server_hosts, Some(server_port));
  let parsed = parse_safe_link_url(callback_url, &base_origin)?;
  if !has_allowed_origin(&parsed, &allowed_origins) {
    return Err(safe_link_forbidden());
  }
  Ok(parsed.into())
}

/// Resolves [`AuthRequestSource`] using the effective `auth.trustedCloudflareHeaders` flag.
pub(crate) async fn resolve_auth_request_source_for_app(
  app: &crate::AppState,
  headers: &HeaderMap,
) -> AuthRequestSource {
  let trusted_cf = app
    .app_config
    .get_effective_app_config()
    .await
    .ok()
    .and_then(|v| v.pointer("/auth/trustedCloudflareHeaders").and_then(|b| b.as_bool()))
    .unwrap_or(false);
  extract_request_source(headers, trusted_cf)
}

/// Returns effective `server.hosts` (DB override replacing baseline).
pub(crate) async fn effective_server_hosts(app: &crate::AppState) -> Vec<String> {
  if let Ok(eff) = app.app_config.get_effective_app_config_arc().await
    && let Some(arr) = eff.pointer("/server/hosts").and_then(serde_json::Value::as_array)
  {
    return arr.iter().filter_map(|v| v.as_str().map(str::to_owned)).collect();
  }
  app.config.load().app_config_baseline.server.hosts.clone()
}

/// Resolves client IP for Turnstile `remoteip`, falling back to `x-real-ip`,
/// `x-forwarded-for`, or socket `peer_addr` when Cloudflare headers are untrusted.
pub(crate) async fn resolve_captcha_remote_ip(
  state: &RouterState,
  headers: &HeaderMap,
  peer: Option<std::net::SocketAddr>,
) -> Option<String> {
  if let Some(ip) = resolve_auth_request_source(state, headers).await.ip {
    return Some(ip);
  }
  headers
    .get("x-real-ip")
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
    })
    .or_else(|| peer.map(|p| p.ip().to_string()))
}

/// Resolves [`AuthRequestSource`] using the effective `auth.trustedCloudflareHeaders` flag.
pub(crate) async fn resolve_auth_request_source(state: &RouterState, headers: &HeaderMap) -> AuthRequestSource {
  resolve_auth_request_source_for_app(&state.app, headers).await
}

/// Validates that `raw` stays on the same origin and within the base path of
/// `external_url` (matching `v0.27.5` `url.safeRedirect`); otherwise falls back
/// to the full `baseUrl` (`origin + base_path`).
pub fn evaluate_local_redirect(raw: &str, external_url: &str) -> String {
  let Ok(base) = url::Url::parse(external_url) else {
    return "/".to_owned();
  };
  let base_path = base.path().trim_end_matches('/');
  let base_url = format!("{}{}", base.origin().ascii_serialization(), base_path);
  let Ok(parsed) = parse_http_url_with_base(raw, external_url) else {
    return base_url;
  };
  if parsed.origin() != base.origin() {
    return base_url;
  }
  if !base_path.is_empty() && parsed.path() != base_path && !parsed.path().starts_with(&format!("{base_path}/")) {
    return base_url;
  }
  parsed.into()
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
