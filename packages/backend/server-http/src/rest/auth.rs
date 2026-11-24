//! Setup, session, preflight, password/magic-link sign-in, and sign-out REST handlers.

use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::Response;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use server_domain::auth::{
  CompleteMagicLinkInput, CookieSignInResult, CreateAdminUserInput, PasswordSignInInput, PrepareMagicLinkInput,
  canonical_email,
};
use server_types::DomainError;
use uuid::Uuid;

use super::{
  CSRF_COOKIE_NAME, RequestPrincipal, SESSION_COOKIE_NAME, USER_ID_COOKIE_NAME, domain_error_to_http_response,
  envelope_to_http_response, extract_cookie, extract_request_source, json_utf8_response, parse_cookies,
  resolve_request_principal, validate_and_build_magic_link_callback_url,
};
use crate::RouterState;
use crate::legacy_compat::errors::LegacyErrorEnvelope;

fn format_http_date(dt: DateTime<Utc>) -> String {
  dt.format("%a, %d %b %Y %H:%M:%S GMT").to_string()
}

fn append_auth_cookies(headers: &mut HeaderMap, res: &CookieSignInResult, https: bool) {
  let expires = format_http_date(res.expires_at);
  let secure_attr = if https { "; Secure" } else { "" };
  let csrf_token = Uuid::new_v4().to_string();

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
        user: Some(SessionUserDto::from(principal.into_user())),
      },
      true,
    ),
    Ok(None) => json_utf8_response(StatusCode::OK, SessionResponseDto { user: None }, true),
    Err(err) => err.into_http_response(),
  }
}

#[derive(Debug, Deserialize)]
pub struct PreflightBody {
  pub email: String,
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

pub(crate) async fn handle_preflight(State(state): State<RouterState>, body_bytes: Bytes) -> Response {
  let body: PreflightBody = match serde_json::from_slice(&body_bytes) {
    Ok(b) => b,
    Err(_) => return invalid_email_response(),
  };
  let email = match canonical_email(&body.email) {
    Ok(e) => e,
    Err(_) => return invalid_email_response(),
  };
  match state.app.auth.login_preflight(&email).await {
    Ok(preflight) => json_utf8_response(StatusCode::OK, preflight, true),
    Err(err) => domain_error_to_http_response(&err),
  }
}

pub(crate) async fn handle_bound_methods(State(state): State<RouterState>, headers: HeaderMap) -> Response {
  let principal = match resolve_request_principal(&state, &headers).await {
    Ok(Some(p)) => p,
    Ok(None) => return domain_error_to_http_response(&DomainError::Unauthorized("Authentication required".into())),
    Err(err) => return err.into_http_response(),
  };
  match state.app.auth.bound_methods(&principal.user().id).await {
    Ok(methods) => json_utf8_response(StatusCode::OK, methods, true),
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
        let client_version = extract_client_version(&headers);
        let body = if is_native_client_request(&headers) {
          match state
            .app
            .auth
            .issue_exchange_code(&sign_in.user.id, client_version.as_deref())
            .await
          {
            Ok(exchange_code) => {
              let mut val = serde_json::to_value(SessionUserDto::from(sign_in.user.clone())).unwrap_or_default();
              if let Some(obj) = val.as_object_mut() {
                obj.insert("exchangeCode".to_owned(), serde_json::Value::String(exchange_code));
              }
              val
            }
            Err(err) => return domain_error_to_http_response(&err),
          }
        } else {
          serde_json::to_value(SessionUserDto::from(sign_in.user.clone())).unwrap_or_default()
        };
        let mut resp = json_utf8_response(StatusCode::OK, body, false);
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
    Err(err) => return err.into_http_response(),
  };

  let session_id = match principal {
    RequestPrincipal::Bearer {
      auth_session_id, user, ..
    } => {
      if let Err(err) = state
        .app
        .auth
        .revoke_auth_session(&auth_session_id, Some(&user.id), "current_device_sign_out")
        .await
      {
        return domain_error_to_http_response(&err);
      }
      return json_utf8_response(StatusCode::OK, serde_json::json!({}), false);
    }
    RequestPrincipal::Cookie { session_id, .. } => session_id,
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
    .sign_out_cookie(&session_id, query.user_id.as_deref())
    .await
  {
    return domain_error_to_http_response(&err);
  }

  let remaining = match state.app.auth.list_cookie_session_users(&session_id).await {
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
      let client_version = extract_client_version(&headers);
      let body = if is_native_client_request(&headers) {
        match state
          .app
          .auth
          .issue_exchange_code(&sign_in.user.id, client_version.as_deref())
          .await
        {
          Ok(exchange_code) => serde_json::json!({ "id": sign_in.user.id, "exchangeCode": exchange_code }),
          Err(err) => return domain_error_to_http_response(&err),
        }
      } else {
        serde_json::json!({ "id": sign_in.user.id })
      };
      let mut resp = json_utf8_response(StatusCode::CREATED, body, false);
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

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OpenAppSignInBody {
  pub code: String,
}

fn invalid_auth_state_response() -> Response {
  envelope_to_http_response(LegacyErrorEnvelope {
    status: StatusCode::BAD_REQUEST.as_u16(),
    code: "Bad Request".into(),
    error_type: "BAD_REQUEST".into(),
    name: "INVALID_AUTH_STATE".into(),
    message: "Invalid auth state.".into(),
    data: None,
  })
}

/// Issues a one-time Open-App sign-in code (`POST /api/auth/open-app/sign-in-code`).
pub(crate) async fn handle_open_app_sign_in_code(State(state): State<RouterState>, headers: HeaderMap) -> Response {
  let user = match resolve_request_principal(&state, &headers).await {
    Ok(Some(principal)) => principal.into_user(),
    Ok(None) => return domain_error_to_http_response(&DomainError::Forbidden("Action forbidden.".into())),
    Err(err) => return err.into_http_response(),
  };
  match state.app.auth.create_open_app_code(&user.id).await {
    Ok(code) => json_utf8_response(StatusCode::CREATED, serde_json::json!({ "code": code }), true),
    Err(DomainError::Unauthorized(_)) => invalid_auth_state_response(),
    Err(err) => domain_error_to_http_response(&err),
  }
}

/// Redeems a one-time Open-App sign-in code (`POST /api/auth/open-app/sign-in`).
pub(crate) async fn handle_open_app_sign_in(
  State(state): State<RouterState>,
  headers: HeaderMap,
  body_bytes: Bytes,
) -> Response {
  let body: OpenAppSignInBody = match serde_json::from_slice::<OpenAppSignInBody>(&body_bytes) {
    Ok(b) if !b.code.trim().is_empty() => b,
    _ => return invalid_auth_state_response(),
  };
  let cookies = parse_cookies(&headers);
  let existing_session_id = extract_cookie(&cookies, SESSION_COOKIE_NAME);
  let client_version = extract_client_version(&headers);
  let target = if is_native_client_request(&headers) {
    server_domain::auth::OpenAppIssueTarget::Native {
      client_version: client_version.as_deref(),
    }
  } else {
    server_domain::auth::OpenAppIssueTarget::Cookie {
      existing_session_id,
      client_version: client_version.as_deref(),
    }
  };
  match state.app.auth.complete_open_app(&body.code, target).await {
    Ok(server_domain::auth::OpenAppSignInResult::Native { user, exchange_code }) => {
      let payload = serde_json::json!({ "id": user.id, "exchangeCode": exchange_code });
      let mut resp = json_utf8_response(StatusCode::CREATED, payload, false);
      append_clear_auth_cookies(resp.headers_mut());
      resp
    }
    Ok(server_domain::auth::OpenAppSignInResult::Cookie(sign_in)) => {
      let cfg = state.app.config.load();
      let payload = serde_json::json!({ "id": sign_in.user.id });
      let mut resp = json_utf8_response(StatusCode::CREATED, payload, false);
      append_auth_cookies(resp.headers_mut(), &sign_in, cfg.https);
      resp
    }
    Err(DomainError::Unauthorized(_)) => invalid_auth_state_response(),
    Err(err) => domain_error_to_http_response(&err),
  }
}

fn is_native_client_request(headers: &HeaderMap) -> bool {
  let kind = headers
    .get("x-affine-client-kind")
    .and_then(|v| v.to_str().ok())
    .map(str::trim);
  if kind != Some("native") {
    return false;
  }
  match headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()).map(str::trim) {
    None | Some("") => true,
    Some("capacitor://localhost" | "ionic://localhost" | "https://localhost") => true,
    Some(_) => false,
  }
}

fn extract_client_version(headers: &HeaderMap) -> Option<String> {
  headers
    .get("x-affine-version")
    .and_then(|v| v.to_str().ok())
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(str::to_owned)
}

fn verify_cookie_csrf(headers: &HeaderMap) -> Result<(), Box<Response>> {
  let cookies = parse_cookies(headers);
  let csrf_cookie = extract_cookie(&cookies, CSRF_COOKIE_NAME);
  let csrf_header = headers
    .get("x-affine-csrf-token")
    .and_then(|v| v.to_str().ok())
    .map(str::trim)
    .filter(|s| !s.is_empty());
  if csrf_cookie.is_none() || csrf_header.is_none() || csrf_cookie != csrf_header {
    return Err(Box::new(domain_error_to_http_response(&DomainError::Forbidden(
      "You are not allowed to perform this action.".into(),
    ))));
  }
  Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExchangeSessionBody {
  pub code: String,
  pub installation_id: String,
  pub platform: String,
  #[serde(default)]
  pub device_name: Option<String>,
}

fn auth_session_json_response(status: StatusCode, body: impl serde::Serialize) -> Response {
  let mut resp = json_utf8_response(status, body, true);
  resp
    .headers_mut()
    .insert(header::PRAGMA, HeaderValue::from_static("no-cache"));
  resp
}

fn validation_error_response(message: impl Into<String>) -> Response {
  envelope_to_http_response(LegacyErrorEnvelope {
    status: StatusCode::BAD_REQUEST.as_u16(),
    code: "Bad Request".into(),
    error_type: "INVALID_INPUT".into(),
    name: "VALIDATION_ERROR".into(),
    message: message.into(),
    data: None,
  })
}

/// Exact match for `zod@3.25.76` `z.string().uuid()` (`v3/types.js:368`):
/// 8-4-4-4-12 hyphenated ASCII hex with no version or variant bit restriction.
fn is_zod_uuid(s: &str) -> bool {
  let b = s.as_bytes();
  if b.len() != 36 || b[8] != b'-' || b[13] != b'-' || b[18] != b'-' || b[23] != b'-' {
    return false;
  }
  for (i, &c) in b.iter().enumerate() {
    if matches!(i, 8 | 13 | 18 | 23) {
      continue;
    }
    if !c.is_ascii_hexdigit() {
      return false;
    }
  }
  true
}

pub(crate) async fn handle_exchange_session(
  State(state): State<RouterState>,
  headers: HeaderMap,
  body_bytes: Bytes,
) -> Response {
  if !is_native_client_request(&headers) {
    return domain_error_to_http_response(&DomainError::Forbidden(
      "You are not allowed to perform this action.".into(),
    ));
  }
  let body: ExchangeSessionBody = match serde_json::from_slice(&body_bytes) {
    Ok(b) => b,
    Err(err) => {
      return validation_error_response(format!("Invalid session exchange payload: {err}"));
    }
  };
  let code = body.code.as_str();
  let code_utf16_len = code.encode_utf16().count();
  let installation_id = body.installation_id.as_str();
  let platform = body.platform.as_str();
  if code_utf16_len == 0
    || code_utf16_len > 512
    || !is_zod_uuid(installation_id)
    || !matches!(platform, "ios" | "android" | "electron")
  {
    return validation_error_response("Invalid session exchange parameters.");
  }
  let device_name = match body.device_name.as_deref() {
    Some(raw) => {
      let trimmed = raw.trim_matches(|c: char| c == '\u{feff}' || (c != '\u{0085}' && c.is_whitespace()));
      let utf16_len = trimmed.encode_utf16().count();
      if utf16_len == 0 || utf16_len > 200 {
        return validation_error_response("Invalid deviceName.");
      }
      Some(trimmed)
    }
    None => None,
  };
  let app_version = extract_client_version(&headers);
  match state
    .app
    .auth
    .exchange_auth_session(code, installation_id, platform, device_name, app_version.as_deref())
    .await
  {
    Ok(pair) => auth_session_json_response(StatusCode::CREATED, pair),
    Err(err) => domain_error_to_http_response(&err),
  }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RefreshSessionBody {
  pub refresh_token: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RefreshSessionResponse {
  status: &'static str,
  #[serde(flatten)]
  pair: server_domain::auth::AuthTokenPair,
}

fn extract_refresh_attempt(headers: &HeaderMap) -> Result<Option<String>, Box<Response>> {
  let Some(raw) = headers.get("x-affine-refresh-attempt") else {
    return Ok(None);
  };
  let Ok(val) = raw.to_str() else {
    return Err(Box::new(validation_error_response(
      "Invalid x-affine-refresh-attempt header.",
    )));
  };
  let trimmed = val.trim();
  if !is_zod_uuid(trimmed) {
    return Err(Box::new(validation_error_response(
      "Invalid x-affine-refresh-attempt header.",
    )));
  }
  Ok(Some(trimmed.to_owned()))
}

pub(crate) async fn handle_refresh_session(
  State(state): State<RouterState>,
  headers: HeaderMap,
  body_bytes: Bytes,
) -> Response {
  if !is_native_client_request(&headers) {
    return domain_error_to_http_response(&DomainError::Forbidden(
      "You are not allowed to perform this action.".into(),
    ));
  }
  let attempt_id = match extract_refresh_attempt(&headers) {
    Ok(id) => id,
    Err(resp) => return *resp,
  };
  let body: RefreshSessionBody = match serde_json::from_slice(&body_bytes) {
    Ok(b) => b,
    Err(err) => {
      return validation_error_response(format!("Invalid session refresh payload: {err}"));
    }
  };
  let refresh_token = body.refresh_token.as_str();
  let rt_utf16_len = refresh_token.encode_utf16().count();
  if rt_utf16_len == 0 || rt_utf16_len > 512 {
    return validation_error_response("Invalid refreshToken.");
  }
  let app_version = extract_client_version(&headers);
  match state
    .app
    .auth
    .refresh_auth_session(refresh_token, app_version.as_deref(), attempt_id.as_deref())
    .await
  {
    Ok(pair) => auth_session_json_response(
      StatusCode::CREATED,
      RefreshSessionResponse {
        status: "rotated",
        pair,
      },
    ),
    Err(DomainError::Unauthorized(code)) if code == "invalid_refresh_token" => {
      envelope_to_http_response(LegacyErrorEnvelope {
        status: StatusCode::UNAUTHORIZED.as_u16(),
        code: "REFRESH_TOKEN_INVALID".into(),
        error_type: "AUTHENTICATION_REQUIRED".into(),
        name: "REFRESH_TOKEN_INVALID".into(),
        message: "The refresh token is invalid.".into(),
        data: None,
      })
    }
    Err(DomainError::Unauthorized(code)) if code == "refresh_token_reused" => {
      envelope_to_http_response(LegacyErrorEnvelope {
        status: StatusCode::UNAUTHORIZED.as_u16(),
        code: "REFRESH_TOKEN_REUSED".into(),
        error_type: "AUTHENTICATION_REQUIRED".into(),
        name: "REFRESH_TOKEN_REUSED".into(),
        message: "The refresh token has already been used.".into(),
        data: None,
      })
    }
    Err(DomainError::Unauthorized(code)) if code == "auth_session_revoked" => {
      envelope_to_http_response(LegacyErrorEnvelope {
        status: StatusCode::UNAUTHORIZED.as_u16(),
        code: "AUTH_SESSION_REVOKED".into(),
        error_type: "AUTHENTICATION_REQUIRED".into(),
        name: "AUTH_SESSION_REVOKED".into(),
        message: "The auth session has been revoked.".into(),
        data: None,
      })
    }
    Err(DomainError::Unauthorized(code)) if code == "auth_session_expired" => {
      envelope_to_http_response(LegacyErrorEnvelope {
        status: StatusCode::UNAUTHORIZED.as_u16(),
        code: "AUTH_SESSION_EXPIRED".into(),
        error_type: "AUTHENTICATION_REQUIRED".into(),
        name: "AUTH_SESSION_EXPIRED".into(),
        message: "The auth session has expired.".into(),
        data: None,
      })
    }
    Err(DomainError::Unavailable(code)) if code == "auth_session_temporarily_unavailable" => {
      envelope_to_http_response(LegacyErrorEnvelope {
        status: StatusCode::SERVICE_UNAVAILABLE.as_u16(),
        code: "AUTH_SESSION_TEMPORARILY_UNAVAILABLE".into(),
        error_type: "NETWORK_ERROR".into(),
        name: "AUTH_SESSION_TEMPORARILY_UNAVAILABLE".into(),
        message: "Auth session service is temporarily unavailable.".into(),
        data: None,
      })
    }
    Err(err) => domain_error_to_http_response(&err),
  }
}

pub(crate) async fn handle_revoke_current_session(
  State(state): State<RouterState>,
  headers: HeaderMap,
  body_bytes: Bytes,
) -> Response {
  if !is_native_client_request(&headers) {
    return domain_error_to_http_response(&DomainError::Forbidden(
      "You are not allowed to perform this action.".into(),
    ));
  }
  let body: RefreshSessionBody = match serde_json::from_slice(&body_bytes) {
    Ok(b) => b,
    Err(err) => {
      return validation_error_response(format!("Invalid session revoke payload: {err}"));
    }
  };
  let refresh_token = body.refresh_token.as_str();
  let rt_utf16_len = refresh_token.encode_utf16().count();
  if rt_utf16_len == 0 || rt_utf16_len > 512 {
    return validation_error_response("Invalid refreshToken.");
  }
  match state
    .app
    .auth
    .revoke_auth_session_by_refresh_token(refresh_token, "current_device_sign_out")
    .await
  {
    Ok(_) => auth_session_json_response(StatusCode::CREATED, serde_json::json!({})),
    Err(err) => domain_error_to_http_response(&err),
  }
}

pub(crate) async fn handle_list_auth_sessions(State(state): State<RouterState>, headers: HeaderMap) -> Response {
  let principal = match resolve_request_principal(&state, &headers).await {
    Ok(Some(p)) => p,
    Ok(None) => return domain_error_to_http_response(&DomainError::Unauthorized("Authentication required".into())),
    Err(err) => return err.into_http_response(),
  };
  let current_id = match &principal {
    RequestPrincipal::Bearer { auth_session_id, .. } => Some(auth_session_id.as_str()),
    RequestPrincipal::Cookie { .. } => None,
  };
  match state.app.auth.list_auth_sessions(&principal.user().id).await {
    Ok(items) => {
      let body: Vec<serde_json::Value> = items
        .into_iter()
        .map(|item| {
          let is_current = current_id == Some(item.id.as_str());
          let mut val = serde_json::to_value(item).unwrap_or_default();
          if let Some(obj) = val.as_object_mut() {
            obj.insert("current".to_owned(), serde_json::Value::Bool(is_current));
          }
          val
        })
        .collect();
      auth_session_json_response(StatusCode::OK, body)
    }
    Err(err) => domain_error_to_http_response(&err),
  }
}

pub(crate) async fn handle_revoke_all_sessions(State(state): State<RouterState>, headers: HeaderMap) -> Response {
  let principal = match resolve_request_principal(&state, &headers).await {
    Ok(Some(p)) => p,
    Ok(None) => return domain_error_to_http_response(&DomainError::Unauthorized("Authentication required".into())),
    Err(err) => return err.into_http_response(),
  };
  if matches!(principal, RequestPrincipal::Cookie { .. })
    && let Err(resp) = verify_cookie_csrf(&headers)
  {
    return *resp;
  }
  match state
    .app
    .auth
    .revoke_all_user_sessions(&principal.user().id, "user_action")
    .await
  {
    Ok(()) => auth_session_json_response(StatusCode::CREATED, serde_json::json!({})),
    Err(err) => domain_error_to_http_response(&err),
  }
}

pub(crate) async fn handle_revoke_auth_session_by_id(
  State(state): State<RouterState>,
  Path(auth_session_id): Path<String>,
  headers: HeaderMap,
) -> Response {
  let principal = match resolve_request_principal(&state, &headers).await {
    Ok(Some(p)) => p,
    Ok(None) => return domain_error_to_http_response(&DomainError::Unauthorized("Authentication required".into())),
    Err(err) => return err.into_http_response(),
  };
  if !is_zod_uuid(&auth_session_id) {
    return envelope_to_http_response(LegacyErrorEnvelope {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "Bad Request".into(),
      error_type: "BAD_REQUEST".into(),
      name: "INVALID_AUTH_STATE".into(),
      message: "Invalid auth state.".into(),
      data: None,
    });
  }
  if matches!(principal, RequestPrincipal::Cookie { .. })
    && let Err(resp) = verify_cookie_csrf(&headers)
  {
    return *resp;
  }
  match state
    .app
    .auth
    .revoke_auth_session(&auth_session_id, Some(&principal.user().id), "user_action")
    .await
  {
    Ok(_) => auth_session_json_response(StatusCode::OK, serde_json::json!({})),
    Err(err) => domain_error_to_http_response(&err),
  }
}
