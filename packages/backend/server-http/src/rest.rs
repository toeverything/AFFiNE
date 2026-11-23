//! REST endpoints for setup, cookie authentication, magic-link, and legacy blob
//! protocol deprecation matching `v0.27.5` 1:1.

use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use server_domain::auth::{
  AuthRequestSource, CompleteMagicLinkInput, CookiePrincipal, CookieSignInResult, CreateAdminUserInput,
  PasswordSignInInput, PrepareMagicLinkInput, canonical_email,
};
use server_types::DomainError;
use uuid::Uuid;

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

pub(crate) async fn resolve_request_principal(
  state: &RouterState,
  headers: &HeaderMap,
) -> Result<Option<CookiePrincipal>, DomainError> {
  let cookies = parse_cookies(headers);
  let Some(session_id) = extract_cookie(&cookies, SESSION_COOKIE_NAME) else {
    return Ok(None);
  };
  let user_id = extract_cookie(&cookies, USER_ID_COOKIE_NAME);
  state
    .app
    .auth
    .resolve_cookie_principal(session_id, user_id, None, false)
    .await
}

fn format_http_date(dt: DateTime<Utc>) -> String {
  dt.format("%a, %d %b %Y %H:%M:%S GMT").to_string()
}

fn append_auth_cookies(headers: &mut HeaderMap, res: &CookieSignInResult, https: bool) {
  let expires = format_http_date(res.expires_at);
  let secure_attr = if https { "; Secure" } else { "" };
  let csrf_token = Uuid::new_v4().to_string();

  // Matches v0.27.5 `core/auth/service.ts:264-272`:
  // `affine_user_id` is client-readable & non-secure (`Path=/; SameSite=Lax`).
  let cookies = [
    format!("{CSRF_COOKIE_NAME}={csrf_token}; Path=/; Expires={expires}; SameSite=Lax{secure_attr}"),
    format!(
      "{SESSION_COOKIE_NAME}={}; Path=/; Expires={expires}; HttpOnly; SameSite=Lax{secure_attr}",
      res.session_id
    ),
    format!("{USER_ID_COOKIE_NAME}={}; Path=/; SameSite=Lax", res.user.id),
  ];

  for cookie in cookies {
    if let Ok(val) = HeaderValue::from_str(&cookie) {
      headers.append(header::SET_COOKIE, val);
    }
  }
}

fn append_user_id_cookie(headers: &mut HeaderMap, user_id: &str) {
  let cookie = format!("{USER_ID_COOKIE_NAME}={user_id}; Path=/; SameSite=Lax");
  if let Ok(val) = HeaderValue::from_str(&cookie) {
    headers.append(header::SET_COOKIE, val);
  }
}

fn append_clear_auth_cookies(headers: &mut HeaderMap) {
  let expired = "Thu, 01 Jan 1970 00:00:00 GMT";
  let cookies = [
    format!("{SESSION_COOKIE_NAME}=; Path=/; Expires={expired}"),
    format!("{USER_ID_COOKIE_NAME}=; Path=/; Expires={expired}"),
    format!("{CSRF_COOKIE_NAME}=; Path=/; Expires={expired}"),
  ];
  for cookie in cookies {
    if let Ok(val) = HeaderValue::from_str(&cookie) {
      headers.append(header::SET_COOKIE, val);
    }
  }
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

/// Validates and resolves magic-link `callbackUrl` (default `"/magic-link"`)
/// into a canonical absolute `http(s)` URL matching `v0.27.5`
/// `packages/backend/native/src/url_policy.rs:62-141` and
/// `packages/backend/server/src/base/helpers/url.ts:16-28, 114-158`.
///
/// Rejects disallowed origins, credentials, control chars, protocol-relative
/// paths, and untrusted `redirect_uri` query targets with `403 ACTION_FORBIDDEN`.
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

/// Extracts request source metadata aligned with `v0.27.5`
/// `packages/backend/server/src/core/auth/service.ts:115-134`.
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

/// Applies `v0.27.5` `base/storage/utils.ts:17-53` binary response security
/// headers (`X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`,
/// and forced `Content-Disposition: attachment` for dangerous inline MIME types).
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

#[derive(Debug, Deserialize)]
pub struct CreateAdminUserBody {
  pub name: Option<String>,
  pub email: String,
  pub password: String,
}

#[derive(Debug, Serialize)]
struct AuthUserSummary {
  email: String,
  id: String,
  name: String,
}

pub(crate) async fn handle_create_admin_user(
  State(state): State<RouterState>,
  axum::Json(body): axum::Json<CreateAdminUserBody>,
) -> Response {
  let result = state
    .app
    .auth
    .create_first_admin_user(CreateAdminUserInput {
      name: body.name,
      email: body.email,
      password: body.password,
      client_version: None,
    })
    .await;

  match result {
    Ok(sign_in) => {
      let cfg = state.app.config.load();
      let mut resp = json_utf8_response(
        StatusCode::CREATED,
        AuthUserSummary {
          email: sign_in.user.email.clone(),
          id: sign_in.user.id.clone(),
          name: sign_in.user.name.clone(),
        },
        false,
      );
      append_auth_cookies(resp.headers_mut(), &sign_in, cfg.https);
      resp
    }
    Err(err) => domain_error_to_http_response(&err),
  }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionUserDto {
  avatar_url: Option<String>,
  disabled: bool,
  email: String,
  email_verified: bool,
  has_password: bool,
  id: String,
  name: String,
}

impl From<server_domain::users::CurrentUserView> for SessionUserDto {
  fn from(u: server_domain::users::CurrentUserView) -> Self {
    Self {
      avatar_url: u.avatar_url,
      disabled: u.disabled,
      email: u.email,
      email_verified: u.email_verified,
      has_password: u.has_password,
      id: u.id,
      name: u.name,
    }
  }
}

#[derive(Debug, Serialize)]
struct SessionResponseDto {
  #[serde(skip_serializing_if = "Option::is_none")]
  user: Option<SessionUserDto>,
}

pub(crate) async fn handle_get_session(State(state): State<RouterState>, headers: HeaderMap) -> Response {
  match resolve_request_principal(&state, &headers).await {
    Ok(Some(principal)) => json_utf8_response(
      StatusCode::OK,
      SessionResponseDto {
        user: Some(SessionUserDto::from(principal.user)),
      },
      true,
    ),
    Ok(None) => json_utf8_response(StatusCode::OK, SessionResponseDto { user: None }, true),
    Err(err) => domain_error_to_http_response(&err),
  }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SignInBody {
  pub email: String,
  #[serde(default)]
  pub password: Option<String>,
  #[serde(rename = "callbackUrl", default)]
  pub callback_url: Option<String>,
  #[serde(default)]
  pub client_nonce: Option<String>,
  #[serde(rename = "verifyToken", default)]
  pub verify_token: Option<String>,
  #[serde(default)]
  pub challenge: Option<String>,
}

fn invalid_email_response() -> Response {
  envelope_to_http_response(LegacyErrorEnvelope {
    status: StatusCode::BAD_REQUEST.as_u16(),
    code: "Bad Request".into(),
    error_type: "INVALID_INPUT".into(),
    name: "INVALID_EMAIL".into(),
    message: "Invalid email format.".into(),
    data: None,
  })
}

pub(crate) async fn handle_sign_in(
  State(state): State<RouterState>,
  headers: HeaderMap,
  body_bytes: Bytes,
) -> Response {
  let body: SignInBody = match serde_json::from_slice(&body_bytes) {
    Ok(b) => b,
    Err(err) => {
      return domain_error_to_http_response(&DomainError::Validation(format!("Invalid sign-in payload: {err}")));
    }
  };
  let email = match canonical_email(&body.email) {
    Ok(e) => e,
    Err(_) => return invalid_email_response(),
  };

  if let Some(password) = body.password {
    if password.is_empty() {
      return domain_error_to_http_response(&DomainError::Validation("Password must not be empty.".to_owned()));
    }
    let cookies = parse_cookies(&headers);
    let existing_session_id = extract_cookie(&cookies, SESSION_COOKIE_NAME).map(str::to_owned);
    let result = state
      .app
      .auth
      .sign_in_with_password(PasswordSignInInput {
        email: email.clone(),
        password,
        existing_session_id,
        client_version: None,
      })
      .await;
    return match result {
      Ok(sign_in) => {
        let cfg = state.app.config.load();
        let mut resp = json_utf8_response(StatusCode::OK, SessionUserDto::from(sign_in.user.clone()), false);
        append_auth_cookies(resp.headers_mut(), &sign_in, cfg.https);
        resp
      }
      Err(DomainError::Unauthorized(code)) if code == "wrong_sign_in_credentials" => {
        envelope_to_http_response(LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "INVALID_INPUT".into(),
          name: "WRONG_SIGN_IN_CREDENTIALS".into(),
          message: format!("Wrong user email or password: {email}"),
          data: Some(serde_json::json!({ "email": email })),
        })
      }
      Err(DomainError::Unauthorized(code)) if code == "wrong_sign_in_method" => {
        envelope_to_http_response(LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "INVALID_INPUT".into(),
          name: "WRONG_SIGN_IN_METHOD".into(),
          message: "Wrong sign in method.".into(),
          data: None,
        })
      }
      Err(err) => domain_error_to_http_response(&err),
    };
  }

  // No password supplied -> send Magic Link (`core/auth/magic-link.ts:31-75`).
  let cfg = state.app.config.load();
  if cfg.app_config_baseline.smtp.host.trim().is_empty() {
    return envelope_to_http_response(LegacyErrorEnvelope {
      status: StatusCode::INTERNAL_SERVER_ERROR.as_u16(),
      code: "Internal Server Error".into(),
      error_type: "INTERNAL_SERVER_ERROR".into(),
      name: "EMAIL_SERVICE_NOT_CONFIGURED".into(),
      message: "Email service is not configured.".into(),
      data: None,
    });
  }

  let raw_callback = body.callback_url.as_deref().unwrap_or("/magic-link");
  let callback_url = match validate_and_build_magic_link_callback_url(
    raw_callback,
    &cfg.external_url,
    &cfg.app_config_baseline.server.hosts,
  ) {
    Ok(url) => url,
    Err(err) => return domain_error_to_http_response(&err),
  };

  let trusted_cf = state
    .app
    .app_config
    .get_effective_app_config()
    .await
    .ok()
    .and_then(|v| v.pointer("/auth/trustedCloudflareHeaders").and_then(|b| b.as_bool()))
    .unwrap_or(false);
  let source = extract_request_source(&headers, trusted_cf);

  let res = state
    .app
    .auth
    .prepare_magic_link(PrepareMagicLinkInput {
      email,
      callback_url,
      client_nonce: body.client_nonce,
      source: Some(source),
    })
    .await;

  match res {
    Ok(prepared) => json_utf8_response(StatusCode::OK, serde_json::json!({ "email": prepared.email }), false),
    Err(err) => domain_error_to_http_response(&err),
  }
}

#[derive(Debug, Deserialize)]
pub struct SignOutQuery {
  #[serde(default)]
  pub user_id: Option<String>,
}

pub(crate) async fn handle_sign_out(
  State(state): State<RouterState>,
  Query(query): Query<SignOutQuery>,
  headers: HeaderMap,
) -> Response {
  let principal = match resolve_request_principal(&state, &headers).await {
    Ok(Some(p)) => p,
    Ok(None) => return json_utf8_response(StatusCode::OK, serde_json::json!({}), false),
    Err(err) => return domain_error_to_http_response(&err),
  };

  let cookies = parse_cookies(&headers);
  let csrf_cookie = extract_cookie(&cookies, CSRF_COOKIE_NAME);
  let csrf_header = headers
    .get("x-affine-csrf-token")
    .and_then(|v| v.to_str().ok())
    .map(str::trim)
    .filter(|s| !s.is_empty());

  if csrf_cookie.is_none() || csrf_header.is_none() || csrf_cookie != csrf_header {
    return domain_error_to_http_response(&DomainError::Forbidden(
      "You are not allowed to perform this action.".into(),
    ));
  }

  if let Err(err) = state
    .app
    .auth
    .sign_out_cookie(&principal.session_id, query.user_id.as_deref())
    .await
  {
    return domain_error_to_http_response(&err);
  }

  let remaining = match state.app.auth.list_cookie_session_users(&principal.session_id).await {
    Ok(users) => users,
    Err(err) => return domain_error_to_http_response(&err),
  };

  let mut resp = json_utf8_response(StatusCode::OK, serde_json::json!({}), false);
  if let Some(last_user_id) = remaining.last() {
    append_user_id_cookie(resp.headers_mut(), last_user_id);
  } else {
    append_clear_auth_cookies(resp.headers_mut());
  }
  resp
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MagicLinkCompleteBody {
  pub email: String,
  pub token: String,
  #[serde(default)]
  pub client_nonce: Option<String>,
}

fn email_token_not_found_response() -> Response {
  envelope_to_http_response(LegacyErrorEnvelope {
    status: StatusCode::BAD_REQUEST.as_u16(),
    code: "Bad Request".into(),
    error_type: "INVALID_INPUT".into(),
    name: "EMAIL_TOKEN_NOT_FOUND".into(),
    message: "The email token provided is not found.".into(),
    data: None,
  })
}

pub(crate) async fn handle_complete_magic_link(
  State(state): State<RouterState>,
  headers: HeaderMap,
  body_bytes: Bytes,
) -> Response {
  let body: MagicLinkCompleteBody = match serde_json::from_slice(&body_bytes) {
    Ok(b) => b,
    Err(_) => return email_token_not_found_response(),
  };
  if body.email.trim().is_empty() || body.token.trim().is_empty() {
    return email_token_not_found_response();
  }
  let email = match canonical_email(&body.email) {
    Ok(e) => e,
    Err(_) => return invalid_email_response(),
  };

  let cookies = parse_cookies(&headers);
  let existing_session_id = extract_cookie(&cookies, SESSION_COOKIE_NAME).map(str::to_owned);
  let res = state
    .app
    .auth
    .complete_magic_link(CompleteMagicLinkInput {
      email,
      otp: body.token,
      client_nonce: body.client_nonce,
      existing_session_id,
      client_version: None,
    })
    .await;

  match res {
    Ok(sign_in) => {
      let cfg = state.app.config.load();
      let mut resp = json_utf8_response(StatusCode::CREATED, serde_json::json!({ "id": sign_in.user.id }), false);
      append_auth_cookies(resp.headers_mut(), &sign_in, cfg.https);
      resp
    }
    Err(DomainError::Unauthorized(code)) if code == "invalid_auth_state" => {
      envelope_to_http_response(LegacyErrorEnvelope {
        status: StatusCode::BAD_REQUEST.as_u16(),
        code: "Bad Request".into(),
        error_type: "BAD_REQUEST".into(),
        name: "INVALID_AUTH_STATE".into(),
        message: "Invalid auth state.".into(),
        data: None,
      })
    }
    Err(DomainError::Unauthorized(_)) => envelope_to_http_response(LegacyErrorEnvelope {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "Bad Request".into(),
      error_type: "INVALID_INPUT".into(),
      name: "INVALID_EMAIL_TOKEN".into(),
      message: "An invalid email token provided.".into(),
      data: None,
    }),
    Err(err) => domain_error_to_http_response(&err),
  }
}

/// Deprecated legacy blob route (`GET /api/workspaces/:workspace_id/blobs/:name`)
/// aligned 1:1 with `v0.27.5` `core/workspaces/controller.ts:169-178`.
pub(crate) async fn handle_get_legacy_blob(
  Path((_workspace_id, _name)): Path<(String, String)>,
  headers: HeaderMap,
) -> Response {
  let client_version = headers
    .get("x-affine-version")
    .and_then(|v| v.to_str().ok())
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or("unset_or_invalid");
  let required_version = ">=0.27.0 (source-scoped blob protocol)";
  envelope_to_http_response(LegacyErrorEnvelope {
    status: StatusCode::FORBIDDEN.as_u16(),
    code: "Forbidden".into(),
    error_type: "ACTION_FORBIDDEN".into(),
    name: "UNSUPPORTED_CLIENT_VERSION".into(),
    message: format!("Unsupported client with version [{client_version}], required version is [{required_version}]."),
    data: Some(serde_json::json!({
      "clientVersion": client_version,
      "requiredVersion": required_version,
    })),
  })
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
    assert_eq!(
      validate_and_build_magic_link_callback_url(
        "/magic-link?redirect_uri=https%3A%2F%2Fapp.affine.pro%2Fhome",
        ext,
        &hosts
      )
      .unwrap(),
      "http://affine.parity.test/magic-link?redirect_uri=https%3A%2F%2Fapp.affine.pro%2Fhome"
    );

    for bad in [
      "//evil.example/steal",
      "/\\evil.example/steal",
      "https://evil.example/steal",
      "https://affine.parity.test/auth/done",
      "http://affine.parity.test:8080/auth/done",
      "http://user:pass@affine.parity.test/magic-link",
      "javascript:alert(1)",
      "/bad\r\nheader",
      "/magic-link?redirect_uri=https%3A%2F%2Fevil.example%2Fphish",
    ] {
      let err = validate_and_build_magic_link_callback_url(bad, ext, &hosts);
      assert!(
        matches!(err, Err(DomainError::Forbidden(_))),
        "expected Forbidden for callbackUrl {bad:?}, got {err:?}"
      );
    }
  }

  #[test]
  fn extract_request_source_matches_v0275_trusted_cloudflare_policy() {
    let mut headers = HeaderMap::new();
    headers.insert("cf-connecting-ip", HeaderValue::from_static("1.2.3.4"));
    headers.insert("x-forwarded-for", HeaderValue::from_static("5.6.7.8, 9.9.9.9"));
    headers.insert("x-affine-cf-asn", HeaderValue::from_static("13335"));

    // Untrusted mode (default): MUST return trusted: false, ip: None, asn: None.
    let untrusted = extract_request_source(&headers, false);
    assert_eq!(
      untrusted,
      AuthRequestSource {
        trusted: false,
        ip: None,
        asn: None,
      }
    );

    // Trusted Cloudflare mode: prefers cf-connecting-ip and reads x-affine-cf-asn.
    let trusted = extract_request_source(&headers, true);
    assert_eq!(
      trusted,
      AuthRequestSource {
        trusted: true,
        ip: Some("1.2.3.4".to_owned()),
        asn: Some(13335),
      }
    );

    // Fallback to x-forwarded-for first hop when cf-connecting-ip is absent.
    headers.remove("cf-connecting-ip");
    let xff = extract_request_source(&headers, true);
    assert_eq!(xff.ip.as_deref(), Some("5.6.7.8"));
  }

  #[test]
  fn apply_blob_security_headers_forces_attachment_for_dangerous_inline_mimes() {
    for (mime, filename, expect_attachment) in [
      ("image/svg+xml", Some("diagram.svg"), true),
      ("text/html; charset=utf-8", Some("page.html"), true),
      ("image/png", Some("photo.png"), false),
    ] {
      let mut headers = HeaderMap::new();
      apply_blob_security_headers(&mut headers, Some(mime), filename);
      assert_eq!(
        headers.get(header::X_CONTENT_TYPE_OPTIONS),
        Some(&HeaderValue::from_static("nosniff"))
      );
      assert_eq!(
        headers.get(header::CACHE_CONTROL),
        Some(&HeaderValue::from_static("private, no-store"))
      );
      let disp = headers.get(header::CONTENT_DISPOSITION).and_then(|v| v.to_str().ok());
      if expect_attachment {
        let disp = disp.expect("expected Content-Disposition attachment header");
        assert!(disp.starts_with("attachment; filename="), "got {disp}");
        assert!(disp.contains("filename*=UTF-8''"), "got {disp}");
      } else {
        assert!(disp.is_none(), "expected no Content-Disposition for {mime}");
      }
    }
  }
}
