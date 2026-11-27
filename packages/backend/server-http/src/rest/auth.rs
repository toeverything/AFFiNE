//! Setup, session, preflight, password/magic-link sign-in, and sign-out REST handlers.

use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::Response;
use serde::{Deserialize, Serialize};
use server_domain::auth::{
  CompleteMagicLinkInput, CookieSignInResult, CreateAdminUserInput, PasswordSignInInput, PrepareMagicLinkInput,
  canonical_email,
};
use server_types::DomainError;
use uuid::Uuid;

use super::throttle::{PeerAddr, ThrottleHeaders, ThrottleSpec, apply_throttle, enforce_throttle_http};
use super::version_guard::extract_non_empty_client_version;
use super::{
  CSRF_COOKIE_NAME, RequestPrincipal, SESSION_COOKIE_NAME, USER_ID_COOKIE_NAME, append_clear_auth_cookies,
  domain_error_to_http_response, enforce_named_version_guard, envelope_to_http_response, extract_cookie,
  format_http_date, json_utf8_response, parse_cookies, resolve_auth_request_source,
  resolve_request_principal_with_policy, validate_and_build_magic_link_callback_url,
};
use crate::RouterState;
use crate::legacy_compat::errors::LegacyErrorEnvelope;

pub(crate) fn append_auth_cookies(headers: &mut HeaderMap, res: &CookieSignInResult, https: bool) {
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
  PeerAddr(peer): PeerAddr,
  headers: HeaderMap,
  axum::Json(body): axum::Json<CreateAdminUserBody>,
) -> Response {
  let throttle = match enforce_throttle_http(&state, &headers, peer, None, ThrottleSpec::Default).await {
    Ok(h) => h,
    Err(resp) => return *resp,
  };
  let result = state
    .app
    .auth
    .create_first_admin_user(CreateAdminUserInput {
      name: body.name,
      email: body.email,
      password: body.password,
      client_version: extract_non_empty_client_version(&headers),
    })
    .await;

  let mut resp = match result {
    Ok(sign_in) => {
      let cfg = state.app.config.load();
      let mut resp = json_utf8_response(
        StatusCode::OK,
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
  };
  apply_throttle(resp.headers_mut(), throttle);
  resp
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

async fn guard_public_auth(
  state: &RouterState,
  headers: &HeaderMap,
  peer: Option<std::net::SocketAddr>,
  spec: ThrottleSpec,
  version_guard: bool,
) -> Result<(super::ResolvedRequestPrincipal, Option<ThrottleHeaders>, bool), Box<Response>> {
  let resolved = resolve_request_principal_with_policy(state, headers, true)
    .await
    .map_err(|e| Box::new(e.into_http_response()))?;
  let https = state.app.config.load().https;
  let throttle = match enforce_throttle_http(state, headers, peer, resolved.principal.as_ref(), spec).await {
    Ok(h) => h,
    Err(mut resp) => {
      resolved.cookie_action.apply_to(resp.headers_mut(), https);
      return Err(resp);
    }
  };
  if version_guard && let Err(mut resp) = enforce_named_version_guard(state, headers, &resolved.cookie_action).await {
    apply_throttle(resp.headers_mut(), throttle);
    return Err(resp);
  }
  Ok((resolved, throttle, https))
}

async fn guard_authed_auth(
  state: &RouterState,
  headers: &HeaderMap,
  peer: Option<std::net::SocketAddr>,
  version_guard: bool,
) -> Result<
  (
    RequestPrincipal,
    super::PrincipalCookieAction,
    Option<ThrottleHeaders>,
    bool,
  ),
  Box<Response>,
> {
  let resolved = resolve_request_principal_with_policy(state, headers, false)
    .await
    .map_err(|e| Box::new(e.into_http_response()))?;
  let https = state.app.config.load().https;
  let Some(principal) = resolved.principal else {
    let mut resp = domain_error_to_http_response(&DomainError::Unauthorized("Authentication required".into()));
    resolved.cookie_action.apply_to(resp.headers_mut(), https);
    return Err(Box::new(resp));
  };
  let throttle = match enforce_throttle_http(state, headers, peer, Some(&principal), ThrottleSpec::Strict).await {
    Ok(h) => h,
    Err(mut resp) => {
      resolved.cookie_action.apply_to(resp.headers_mut(), https);
      return Err(resp);
    }
  };
  if version_guard && let Err(mut resp) = enforce_named_version_guard(state, headers, &resolved.cookie_action).await {
    apply_throttle(resp.headers_mut(), throttle);
    return Err(resp);
  }
  Ok((principal, resolved.cookie_action, throttle, https))
}

pub(crate) async fn handle_get_session(
  State(state): State<RouterState>,
  PeerAddr(peer): PeerAddr,
  headers: HeaderMap,
) -> Response {
  let spec = ThrottleSpec::DefaultCustom {
    handler: "currentSessionUser",
    limit: 1200,
    ttl_ms: None,
  };
  let (resolved, throttle, https) = match guard_public_auth(&state, &headers, peer, spec, true).await {
    Ok(v) => v,
    Err(resp) => return *resp,
  };
  let mut resp = json_utf8_response(
    StatusCode::OK,
    SessionResponseDto {
      user: resolved.principal.map(|p| SessionUserDto::from(p.into_user())),
    },
    true,
  );
  resolved.cookie_action.apply_to(resp.headers_mut(), https);
  apply_throttle(resp.headers_mut(), throttle);
  resp
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

pub(crate) async fn handle_preflight(
  State(state): State<RouterState>,
  PeerAddr(peer): PeerAddr,
  headers: HeaderMap,
  body_bytes: Bytes,
) -> Response {
  let (resolved, throttle, https) = match guard_public_auth(&state, &headers, peer, ThrottleSpec::Strict, true).await {
    Ok(v) => v,
    Err(resp) => return *resp,
  };
  let mut resp = match serde_json::from_slice::<PreflightBody>(&body_bytes) {
    Ok(body) => match canonical_email(&body.email) {
      Ok(email) => match state.app.auth.login_preflight(&email).await {
        Ok(preflight) => json_utf8_response(StatusCode::CREATED, preflight, true),
        Err(err) => domain_error_to_http_response(&err),
      },
      Err(_) => invalid_email_response(),
    },
    Err(_) => invalid_email_response(),
  };
  resolved.cookie_action.apply_to(resp.headers_mut(), https);
  apply_throttle(resp.headers_mut(), throttle);
  resp
}

pub(crate) async fn handle_bound_methods(
  State(state): State<RouterState>,
  PeerAddr(peer): PeerAddr,
  headers: HeaderMap,
) -> Response {
  let (principal, cookie_action, throttle, https) = match guard_authed_auth(&state, &headers, peer, true).await {
    Ok(v) => v,
    Err(resp) => return *resp,
  };
  let mut resp = match state.app.auth.bound_methods(&principal.user().id).await {
    Ok(methods) => json_utf8_response(StatusCode::OK, methods, true),
    Err(err) => domain_error_to_http_response(&err),
  };
  cookie_action.apply_to(resp.headers_mut(), https);
  apply_throttle(resp.headers_mut(), throttle);
  resp
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

async fn check_sign_in_rate_bucket(state: &RouterState, key: &str, limit: u64, ttl_ms: u64) -> Result<(), u64> {
  if limit == 0 || ttl_ms == 0 {
    return Ok(());
  }
  if let Some(client) = state.app.redis.as_ref() {
    let mut conn = state.app.throttle_redis_conn.lock().await.clone();
    if conn.is_none() {
      conn = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        client.get_multiplexed_async_connection(),
      )
      .await
      .ok()
      .and_then(Result::ok);
    }
    if let Some(mut c) = conn {
      let script = redis::Script::new(
        "local h = redis.call('INCR', KEYS[1]) \
         if h == 1 or redis.call('PTTL', KEYS[1]) == -1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end \
         local pttl = redis.call('PTTL', KEYS[1]) \
         if pttl < 0 then pttl = tonumber(ARGV[1]) end \
         return {h, pttl}",
      );
      let res: Option<(u64, i64)> = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        script.key(key).arg(ttl_ms).invoke_async(&mut c),
      )
      .await
      .ok()
      .and_then(Result::ok);
      if let Some((hits, rem_ms)) = res {
        *state.app.throttle_redis_conn.lock().await = Some(c);
        if hits > limit {
          let retry_after_secs = (rem_ms.max(1) as u64).div_ceil(1000).max(1);
          return Err(retry_after_secs);
        }
        return Ok(());
      }
    }
  }
  use std::collections::HashMap;
  use std::sync::{Mutex, OnceLock};
  use std::time::{Duration, Instant};
  struct MemRateTable {
    map: HashMap<String, (u64, Instant)>,
    last_gc: Instant,
  }
  const MAX_MEM_RATE_KEYS: usize = 4096;
  static MEM: OnceLock<Mutex<MemRateTable>> = OnceLock::new();
  let now = Instant::now();
  let window = Duration::from_millis(ttl_ms);
  let Ok(mut table) = MEM
    .get_or_init(|| {
      Mutex::new(MemRateTable {
        map: HashMap::new(),
        last_gc: now,
      })
    })
    .lock()
  else {
    return Ok(());
  };
  if table.map.len() >= MAX_MEM_RATE_KEYS && now.duration_since(table.last_gc) >= Duration::from_secs(1) {
    table.map.retain(|_, (_, exp)| *exp > now);
    table.last_gc = now;
  }
  if table.map.len() >= MAX_MEM_RATE_KEYS
    && !table.map.contains_key(key)
    && let Some(oldest_key) = table
      .map
      .iter()
      .min_by_key(|(_, (_, exp))| *exp)
      .map(|(k, _)| k.clone())
  {
    table.map.remove(&oldest_key);
  }
  let entry = table.map.entry(key.to_owned()).or_insert((0, now + window));
  if entry.1 <= now {
    *entry = (0, now + window);
  }
  entry.0 += 1;
  if entry.0 > limit {
    let rem_ms = entry.1.saturating_duration_since(now).as_millis() as u64;
    let retry_after_secs = rem_ms.div_ceil(1000).max(1);
    return Err(retry_after_secs);
  }
  Ok(())
}

async fn enforce_sign_in_rate_limit(
  state: &RouterState,
  headers: &HeaderMap,
  peer: Option<std::net::SocketAddr>,
  canonical_email_str: &str,
) -> Result<(), Box<Response>> {
  let eff = state.app.app_config.get_effective_app_config_arc().await.ok();
  let rl = eff.as_ref().and_then(|c| c.pointer("/auth/signInRateLimit"));
  let ttl_ms = rl.and_then(|v| v.get("ttl")?.as_u64()).unwrap_or(60_000);
  let email_limit = rl.and_then(|v| v.get("emailLimit")?.as_u64()).unwrap_or(5);
  let ip_limit = rl.and_then(|v| v.get("ipLimit")?.as_u64()).unwrap_or(20);
  let key_prefix = state
    .app
    .app_config
    .get_internal_redis_key_prefix()
    .await
    .unwrap_or_default();

  use sha2::{Digest as _, Sha256};
  let email_hash = hex::encode(Sha256::digest(canonical_email_str.to_ascii_lowercase().as_bytes()));
  let email_key = format!("{key_prefix}auth:sign-in-rate:email:{email_hash}");
  let email_res = check_sign_in_rate_bucket(state, &email_key, email_limit, ttl_ms).await;

  let ip = ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"]
    .into_iter()
    .find_map(|name| {
      let raw = headers.get(name)?.to_str().ok()?;
      let s = if name == "x-forwarded-for" {
        raw.split(',').next()?
      } else {
        raw
      }
      .trim();
      (!s.is_empty()).then(|| s.to_owned())
    })
    .or_else(|| peer.map(|a| a.ip().to_string()));
  let ip_res = if let Some(ip_str) = ip {
    let ip_hash = hex::encode(Sha256::digest(ip_str.as_bytes()));
    let ip_key = format!("{key_prefix}auth:sign-in-rate:ip:{ip_hash}");
    check_sign_in_rate_bucket(state, &ip_key, ip_limit, ttl_ms).await
  } else {
    Ok(())
  };

  let retry_after = match (email_res, ip_res) {
    (Err(a), Err(b)) => Some(a.max(b)),
    (Err(a), Ok(())) | (Ok(()), Err(a)) => Some(a),
    (Ok(()), Ok(())) => None,
  };
  if let Some(retry_after_secs) = retry_after {
    let mut resp = envelope_to_http_response(super::throttle::too_many_requests_envelope());
    if let Ok(v) = HeaderValue::from_str(&retry_after_secs.to_string()) {
      resp.headers_mut().insert(header::RETRY_AFTER, v);
    }
    return Err(Box::new(resp));
  }
  Ok(())
}

pub(crate) async fn handle_sign_in(
  State(state): State<RouterState>,
  PeerAddr(peer): PeerAddr,
  headers: HeaderMap,
  body_bytes: Bytes,
) -> Response {
  let (resolved, throttle, https) = match guard_public_auth(&state, &headers, peer, ThrottleSpec::Strict, true).await {
    Ok(v) => v,
    Err(resp) => return *resp,
  };
  let role = state.app.config.load().role;
  if role != server_types::ServerRole::Front
    && let Err(mut resp) = super::captcha::enforce_named_captcha_guard(&state, &headers, &resolved.cookie_action).await
  {
    apply_throttle(resp.headers_mut(), throttle);
    return *resp;
  }
  let apply_old_cookie = |mut resp: Response| -> Response {
    resolved.cookie_action.apply_to(resp.headers_mut(), https);
    apply_throttle(resp.headers_mut(), throttle);
    resp
  };
  let body: SignInBody = match serde_json::from_slice(&body_bytes) {
    Ok(b) => b,
    Err(err) => {
      return apply_old_cookie(domain_error_to_http_response(&DomainError::Validation(format!(
        "Invalid sign-in payload: {err}"
      ))));
    }
  };
  let email = match canonical_email(&body.email) {
    Ok(e) => e,
    Err(_) => return apply_old_cookie(invalid_email_response()),
  };
  if let Err(resp) = enforce_sign_in_rate_limit(&state, &headers, peer, &email).await {
    return apply_old_cookie(*resp);
  }

  if let Some(password) = body.password {
    if password.is_empty() {
      return apply_old_cookie(domain_error_to_http_response(&DomainError::Validation(
        "Password must not be empty.".to_owned(),
      )));
    }
    if password.len() > server_domain::auth::password::MAX_PASSWORD_BYTES {
      return apply_old_cookie(domain_error_to_http_response(&DomainError::Validation(
        "Password exceeds maximum allowed length.".to_owned(),
      )));
    }
    let client_version = extract_non_empty_client_version(&headers);
    if is_native_client_request(&headers) {
      return match state
        .app
        .auth
        .sign_in_with_password_native(&email, &password, client_version.as_deref())
        .await
      {
        Ok((user, exchange_code)) => {
          let mut val = serde_json::to_value(SessionUserDto::from(user)).unwrap_or_default();
          if let Some(obj) = val.as_object_mut() {
            obj.insert("exchangeCode".to_owned(), serde_json::Value::String(exchange_code));
          }
          let mut resp = json_utf8_response(StatusCode::OK, val, false);
          append_clear_auth_cookies(resp.headers_mut(), https);
          apply_throttle(resp.headers_mut(), throttle);
          resp
        }
        Err(DomainError::Unauthorized(code)) if code == "wrong_sign_in_credentials" => {
          apply_old_cookie(envelope_to_http_response(LegacyErrorEnvelope {
            status: StatusCode::BAD_REQUEST.as_u16(),
            code: "Bad Request".into(),
            error_type: "INVALID_INPUT".into(),
            name: "WRONG_SIGN_IN_CREDENTIALS".into(),
            message: format!("Wrong user email or password: {email}"),
            data: Some(serde_json::json!({ "email": email })),
          }))
        }
        Err(DomainError::Unauthorized(code)) if code == "wrong_sign_in_method" => {
          apply_old_cookie(envelope_to_http_response(LegacyErrorEnvelope {
            status: StatusCode::BAD_REQUEST.as_u16(),
            code: "Bad Request".into(),
            error_type: "INVALID_INPUT".into(),
            name: "WRONG_SIGN_IN_METHOD".into(),
            message: "Wrong sign in method.".into(),
            data: None,
          }))
        }
        Err(err) => apply_old_cookie(domain_error_to_http_response(&err)),
      };
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
        client_version,
      })
      .await;
    return match result {
      Ok(sign_in) => {
        let cfg = state.app.config.load();
        let body = serde_json::to_value(SessionUserDto::from(sign_in.user.clone())).unwrap_or_default();
        let mut resp = json_utf8_response(StatusCode::OK, body, false);
        append_auth_cookies(resp.headers_mut(), &sign_in, cfg.https);
        apply_throttle(resp.headers_mut(), throttle);
        resp
      }
      Err(DomainError::Unauthorized(code)) if code == "wrong_sign_in_credentials" => {
        apply_old_cookie(envelope_to_http_response(LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "INVALID_INPUT".into(),
          name: "WRONG_SIGN_IN_CREDENTIALS".into(),
          message: format!("Wrong user email or password: {email}"),
          data: Some(serde_json::json!({ "email": email })),
        }))
      }
      Err(DomainError::Unauthorized(code)) if code == "wrong_sign_in_method" => {
        apply_old_cookie(envelope_to_http_response(LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "INVALID_INPUT".into(),
          name: "WRONG_SIGN_IN_METHOD".into(),
          message: "Wrong sign in method.".into(),
          data: None,
        }))
      }
      Err(err) => apply_old_cookie(domain_error_to_http_response(&err)),
    };
  }

  let cfg = state.app.config.load();
  let eff_cfg = state.app.app_config.get_effective_app_config().await.ok();
  let smtp_host = eff_cfg
    .as_ref()
    .and_then(|c| c.pointer("/mailer/SMTP/host")?.as_str())
    .unwrap_or(&cfg.app_config_baseline.smtp.host);
  if smtp_host.trim().is_empty() {
    return apply_old_cookie(envelope_to_http_response(LegacyErrorEnvelope {
      status: StatusCode::INTERNAL_SERVER_ERROR.as_u16(),
      code: "Internal Server Error".into(),
      error_type: "INTERNAL_SERVER_ERROR".into(),
      name: "EMAIL_SERVICE_NOT_CONFIGURED".into(),
      message: "Email service is not configured.".into(),
      data: None,
    }));
  }

  let mut dynamic_hosts = cfg.app_config_baseline.server.hosts.clone();
  if let Some(arr) = eff_cfg.as_ref().and_then(|c| c.pointer("/server/hosts")?.as_array()) {
    for h in arr.iter().filter_map(serde_json::Value::as_str) {
      if !h.is_empty() && !dynamic_hosts.iter().any(|x| x == h) {
        dynamic_hosts.push(h.to_owned());
      }
    }
  }
  let raw_callback = body.callback_url.as_deref().unwrap_or("/magic-link");
  let callback_url = match validate_and_build_magic_link_callback_url(raw_callback, &cfg.external_url, &dynamic_hosts) {
    Ok(url) => url,
    Err(err) => return apply_old_cookie(domain_error_to_http_response(&err)),
  };

  let source = resolve_auth_request_source(&state, &headers).await;

  let res = state
    .app
    .auth
    .prepare_magic_link(PrepareMagicLinkInput {
      email: email.clone(),
      callback_url,
      client_nonce: body.client_nonce,
      source: Some(source),
    })
    .await;

  let resp = match res {
    Ok(prepared) => json_utf8_response(StatusCode::OK, serde_json::json!({ "email": prepared.email }), false),
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
    Err(DomainError::Forbidden(code)) if code == "sign_up_forbidden" => {
      envelope_to_http_response(LegacyErrorEnvelope {
        status: StatusCode::FORBIDDEN.as_u16(),
        code: "Forbidden".into(),
        error_type: "ACTION_FORBIDDEN".into(),
        name: "SIGN_UP_FORBIDDEN".into(),
        message: "Sign up is forbidden.".into(),
        data: None,
      })
    }
    Err(err) => domain_error_to_http_response(&err),
  };
  apply_old_cookie(resp)
}

#[derive(Debug, Deserialize)]
pub struct SignOutQuery {
  #[serde(default)]
  pub user_id: Option<String>,
}

pub(crate) async fn handle_sign_out(
  State(state): State<RouterState>,
  PeerAddr(peer): PeerAddr,
  Query(query): Query<SignOutQuery>,
  headers: HeaderMap,
) -> Response {
  let (principal, cookie_action, throttle, https) = match guard_authed_auth(&state, &headers, peer, false).await {
    Ok(v) => v,
    Err(resp) => return *resp,
  };
  let finish = |mut resp: Response| -> Response {
    apply_throttle(resp.headers_mut(), throttle);
    resp
  };
  let finish_err = |mut resp: Response| -> Response {
    cookie_action.apply_to(resp.headers_mut(), https);
    apply_throttle(resp.headers_mut(), throttle);
    resp
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
        return finish_err(domain_error_to_http_response(&err));
      }
      return finish(json_utf8_response(StatusCode::OK, serde_json::json!({}), false));
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
    return finish_err(domain_error_to_http_response(&DomainError::Forbidden(
      "You are not allowed to perform this action.".into(),
    )));
  }

  if let Err(err) = state
    .app
    .auth
    .sign_out_cookie(&session_id, query.user_id.as_deref())
    .await
  {
    return finish_err(domain_error_to_http_response(&err));
  }

  let remaining = match state.app.auth.list_cookie_session_users(&session_id).await {
    Ok(users) => users,
    Err(err) => return finish_err(domain_error_to_http_response(&err)),
  };

  let mut resp = json_utf8_response(StatusCode::OK, serde_json::json!({}), false);
  if let Some(last_user_id) = remaining.last() {
    cookie_action.apply_to(resp.headers_mut(), https);
    append_user_id_cookie(resp.headers_mut(), last_user_id);
  } else {
    append_clear_auth_cookies(resp.headers_mut(), https);
  }
  finish(resp)
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
  PeerAddr(peer): PeerAddr,
  headers: HeaderMap,
  body_bytes: Bytes,
) -> Response {
  let (resolved, throttle, https) = match guard_public_auth(&state, &headers, peer, ThrottleSpec::Strict, true).await {
    Ok(v) => v,
    Err(resp) => return *resp,
  };
  let apply_old_cookie = |mut resp: Response| -> Response {
    resolved.cookie_action.apply_to(resp.headers_mut(), https);
    apply_throttle(resp.headers_mut(), throttle);
    resp
  };
  let body: MagicLinkCompleteBody = match serde_json::from_slice(&body_bytes) {
    Ok(b) => b,
    Err(_) => return apply_old_cookie(email_token_not_found_response()),
  };
  if body.email.trim().is_empty() || body.token.trim().is_empty() {
    return apply_old_cookie(email_token_not_found_response());
  }
  let email = match canonical_email(&body.email) {
    Ok(e) => e,
    Err(_) => return apply_old_cookie(invalid_email_response()),
  };

  let client_version = extract_non_empty_client_version(&headers);
  if is_native_client_request(&headers) {
    let res = state
      .app
      .auth
      .complete_magic_link_native(CompleteMagicLinkInput {
        email,
        otp: body.token,
        client_nonce: body.client_nonce,
        existing_session_id: None,
        client_version,
      })
      .await;
    return match res {
      Ok((user, exchange_code)) => {
        let mut resp = json_utf8_response(
          StatusCode::OK,
          serde_json::json!({ "id": user.id, "exchangeCode": exchange_code }),
          false,
        );
        append_clear_auth_cookies(resp.headers_mut(), https);
        apply_throttle(resp.headers_mut(), throttle);
        resp
      }
      Err(DomainError::Unauthorized(code)) if code == "invalid_auth_state" => {
        apply_old_cookie(invalid_auth_state_response())
      }
      Err(DomainError::Unauthorized(_)) => apply_old_cookie(envelope_to_http_response(LegacyErrorEnvelope {
        status: StatusCode::BAD_REQUEST.as_u16(),
        code: "Bad Request".into(),
        error_type: "INVALID_INPUT".into(),
        name: "INVALID_EMAIL_TOKEN".into(),
        message: "An invalid email token provided.".into(),
        data: None,
      })),
      Err(DomainError::Forbidden(code)) if code == "sign_up_forbidden" => {
        apply_old_cookie(envelope_to_http_response(LegacyErrorEnvelope {
          status: StatusCode::FORBIDDEN.as_u16(),
          code: "Forbidden".into(),
          error_type: "ACTION_FORBIDDEN".into(),
          name: "SIGN_UP_FORBIDDEN".into(),
          message: "Sign up is forbidden.".into(),
          data: None,
        }))
      }
      Err(err) => apply_old_cookie(domain_error_to_http_response(&err)),
    };
  }

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
      client_version,
    })
    .await;

  match res {
    Ok(sign_in) => {
      let cfg = state.app.config.load();
      let mut resp = json_utf8_response(StatusCode::OK, serde_json::json!({ "id": sign_in.user.id }), false);
      append_auth_cookies(resp.headers_mut(), &sign_in, cfg.https);
      apply_throttle(resp.headers_mut(), throttle);
      resp
    }
    Err(DomainError::Unauthorized(code)) if code == "invalid_auth_state" => {
      apply_old_cookie(envelope_to_http_response(LegacyErrorEnvelope {
        status: StatusCode::BAD_REQUEST.as_u16(),
        code: "Bad Request".into(),
        error_type: "BAD_REQUEST".into(),
        name: "INVALID_AUTH_STATE".into(),
        message: "Invalid auth state.".into(),
        data: None,
      }))
    }
    Err(DomainError::Unauthorized(_)) => apply_old_cookie(envelope_to_http_response(LegacyErrorEnvelope {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "Bad Request".into(),
      error_type: "INVALID_INPUT".into(),
      name: "INVALID_EMAIL_TOKEN".into(),
      message: "An invalid email token provided.".into(),
      data: None,
    })),
    Err(DomainError::Forbidden(code)) if code == "sign_up_forbidden" => {
      apply_old_cookie(envelope_to_http_response(LegacyErrorEnvelope {
        status: StatusCode::FORBIDDEN.as_u16(),
        code: "Forbidden".into(),
        error_type: "ACTION_FORBIDDEN".into(),
        name: "SIGN_UP_FORBIDDEN".into(),
        message: "Sign up is forbidden.".into(),
        data: None,
      }))
    }
    Err(err) => apply_old_cookie(domain_error_to_http_response(&err)),
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
pub(crate) async fn handle_open_app_sign_in_code(
  State(state): State<RouterState>,
  PeerAddr(peer): PeerAddr,
  headers: HeaderMap,
) -> Response {
  let (resolved, throttle, https) = match guard_public_auth(&state, &headers, peer, ThrottleSpec::Strict, true).await {
    Ok(v) => v,
    Err(resp) => return *resp,
  };
  let Some(principal) = resolved.principal else {
    let mut resp = domain_error_to_http_response(&DomainError::Forbidden("Action forbidden.".into()));
    resolved.cookie_action.apply_to(resp.headers_mut(), https);
    apply_throttle(resp.headers_mut(), throttle);
    return resp;
  };
  let user = principal.into_user();
  let mut resp = match state.app.auth.create_open_app_code(&user.id).await {
    Ok(code) => json_utf8_response(StatusCode::CREATED, serde_json::json!({ "code": code }), true),
    Err(DomainError::Unauthorized(_)) => invalid_auth_state_response(),
    Err(err) => domain_error_to_http_response(&err),
  };
  resolved.cookie_action.apply_to(resp.headers_mut(), https);
  apply_throttle(resp.headers_mut(), throttle);
  resp
}

/// Redeems a one-time Open-App sign-in code (`POST /api/auth/open-app/sign-in`).
pub(crate) async fn handle_open_app_sign_in(
  State(state): State<RouterState>,
  PeerAddr(peer): PeerAddr,
  headers: HeaderMap,
  body_bytes: Bytes,
) -> Response {
  let (resolved, throttle, https) = match guard_public_auth(&state, &headers, peer, ThrottleSpec::Strict, true).await {
    Ok(v) => v,
    Err(resp) => return *resp,
  };
  let apply_old_cookie = |mut resp: Response| -> Response {
    resolved.cookie_action.apply_to(resp.headers_mut(), https);
    apply_throttle(resp.headers_mut(), throttle);
    resp
  };
  let body: OpenAppSignInBody = match serde_json::from_slice::<OpenAppSignInBody>(&body_bytes) {
    Ok(b) if !b.code.trim().is_empty() => b,
    _ => return apply_old_cookie(invalid_auth_state_response()),
  };
  let cookies = parse_cookies(&headers);
  let existing_session_id = extract_cookie(&cookies, SESSION_COOKIE_NAME);
  let client_version = extract_non_empty_client_version(&headers);
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
      let mut resp = json_utf8_response(StatusCode::OK, payload, false);
      append_clear_auth_cookies(resp.headers_mut(), https);
      apply_throttle(resp.headers_mut(), throttle);
      resp
    }
    Ok(server_domain::auth::OpenAppSignInResult::Cookie(sign_in)) => {
      let cfg = state.app.config.load();
      let payload = serde_json::json!({ "id": sign_in.user.id });
      let mut resp = json_utf8_response(StatusCode::OK, payload, false);
      append_auth_cookies(resp.headers_mut(), &sign_in, cfg.https);
      apply_throttle(resp.headers_mut(), throttle);
      resp
    }
    Err(DomainError::Unauthorized(_)) => apply_old_cookie(invalid_auth_state_response()),
    Err(err) => apply_old_cookie(domain_error_to_http_response(&err)),
  }
}

pub(crate) fn is_native_client_request(headers: &HeaderMap) -> bool {
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
  PeerAddr(peer): PeerAddr,
  headers: HeaderMap,
  body_bytes: Bytes,
) -> Response {
  let (resolved, throttle, https) = match guard_public_auth(&state, &headers, peer, ThrottleSpec::Strict, true).await {
    Ok(v) => v,
    Err(resp) => return *resp,
  };
  let apply_cookie = |mut resp: Response| -> Response {
    resolved.cookie_action.apply_to(resp.headers_mut(), https);
    apply_throttle(resp.headers_mut(), throttle);
    resp
  };
  if !is_native_client_request(&headers) {
    return apply_cookie(domain_error_to_http_response(&DomainError::Forbidden(
      "You are not allowed to perform this action.".into(),
    )));
  }
  let body: ExchangeSessionBody = match serde_json::from_slice(&body_bytes) {
    Ok(b) => b,
    Err(err) => {
      return apply_cookie(validation_error_response(format!(
        "Invalid session exchange payload: {err}"
      )));
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
    return apply_cookie(validation_error_response("Invalid session exchange parameters."));
  }
  let device_name = match body.device_name.as_deref() {
    Some(raw) => {
      let trimmed = raw.trim_matches(|c: char| c == '\u{feff}' || (c != '\u{0085}' && c.is_whitespace()));
      let utf16_len = trimmed.encode_utf16().count();
      if utf16_len == 0 || utf16_len > 200 {
        return apply_cookie(validation_error_response("Invalid deviceName."));
      }
      Some(trimmed)
    }
    None => None,
  };
  let app_version = extract_non_empty_client_version(&headers);
  let resp = match state
    .app
    .auth
    .exchange_auth_session(code, installation_id, platform, device_name, app_version.as_deref())
    .await
  {
    Ok(pair) => auth_session_json_response(StatusCode::CREATED, pair),
    Err(DomainError::Unauthorized(code)) if code == "invalid_auth_state" => invalid_auth_state_response(),
    Err(err) => domain_error_to_http_response(&err),
  };
  apply_cookie(resp)
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
  PeerAddr(peer): PeerAddr,
  headers: HeaderMap,
  body_bytes: Bytes,
) -> Response {
  let spec = ThrottleSpec::DefaultCustom {
    handler: "refreshAuthSession",
    limit: 120,
    ttl_ms: Some(60_000),
  };
  let (resolved, throttle, https) = match guard_public_auth(&state, &headers, peer, spec, true).await {
    Ok(v) => v,
    Err(resp) => return *resp,
  };
  let apply_cookie = |mut resp: Response| -> Response {
    resolved.cookie_action.apply_to(resp.headers_mut(), https);
    apply_throttle(resp.headers_mut(), throttle);
    resp
  };
  if !is_native_client_request(&headers) {
    return apply_cookie(domain_error_to_http_response(&DomainError::Forbidden(
      "You are not allowed to perform this action.".into(),
    )));
  }
  let attempt_id = match extract_refresh_attempt(&headers) {
    Ok(id) => id,
    Err(resp) => return apply_cookie(*resp),
  };
  let body: RefreshSessionBody = match serde_json::from_slice(&body_bytes) {
    Ok(b) => b,
    Err(err) => {
      return apply_cookie(validation_error_response(format!(
        "Invalid session refresh payload: {err}"
      )));
    }
  };
  let refresh_token = body.refresh_token.as_str();
  let rt_utf16_len = refresh_token.encode_utf16().count();
  if rt_utf16_len == 0 || rt_utf16_len > 512 {
    return apply_cookie(validation_error_response("Invalid refreshToken."));
  }
  let app_version = extract_non_empty_client_version(&headers);
  let resp = match state
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
  };
  apply_cookie(resp)
}

pub(crate) async fn handle_revoke_current_session(
  State(state): State<RouterState>,
  PeerAddr(peer): PeerAddr,
  headers: HeaderMap,
  body_bytes: Bytes,
) -> Response {
  let (resolved, throttle, https) = match guard_public_auth(&state, &headers, peer, ThrottleSpec::Strict, true).await {
    Ok(v) => v,
    Err(resp) => return *resp,
  };
  let apply_cookie = |mut resp: Response| -> Response {
    resolved.cookie_action.apply_to(resp.headers_mut(), https);
    apply_throttle(resp.headers_mut(), throttle);
    resp
  };
  if !is_native_client_request(&headers) {
    return apply_cookie(domain_error_to_http_response(&DomainError::Forbidden(
      "You are not allowed to perform this action.".into(),
    )));
  }
  let body: RefreshSessionBody = match serde_json::from_slice(&body_bytes) {
    Ok(b) => b,
    Err(err) => {
      return apply_cookie(validation_error_response(format!(
        "Invalid session revoke payload: {err}"
      )));
    }
  };
  let refresh_token = body.refresh_token.as_str();
  let rt_utf16_len = refresh_token.encode_utf16().count();
  if rt_utf16_len == 0 || rt_utf16_len > 512 {
    return apply_cookie(validation_error_response("Invalid refreshToken."));
  }
  let resp = match state
    .app
    .auth
    .revoke_auth_session_by_refresh_token(refresh_token, "refresh_token_revoke")
    .await
  {
    Ok(_) => auth_session_json_response(StatusCode::CREATED, serde_json::json!({})),
    Err(err) => domain_error_to_http_response(&err),
  };
  apply_cookie(resp)
}

pub(crate) async fn handle_list_auth_sessions(
  State(state): State<RouterState>,
  PeerAddr(peer): PeerAddr,
  headers: HeaderMap,
) -> Response {
  let (principal, cookie_action, throttle, https) = match guard_authed_auth(&state, &headers, peer, false).await {
    Ok(v) => v,
    Err(resp) => return *resp,
  };
  let current_id = match &principal {
    RequestPrincipal::Bearer { auth_session_id, .. } => Some(auth_session_id.as_str()),
    RequestPrincipal::Cookie { .. } => None,
  };
  let mut resp = match state.app.auth.list_auth_sessions(&principal.user().id).await {
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
  };
  cookie_action.apply_to(resp.headers_mut(), https);
  apply_throttle(resp.headers_mut(), throttle);
  resp
}

pub(crate) async fn handle_revoke_all_sessions(
  State(state): State<RouterState>,
  PeerAddr(peer): PeerAddr,
  headers: HeaderMap,
) -> Response {
  let (principal, cookie_action, throttle, https) = match guard_authed_auth(&state, &headers, peer, false).await {
    Ok(v) => v,
    Err(resp) => return *resp,
  };
  if matches!(principal, RequestPrincipal::Cookie { .. })
    && let Err(mut resp) = verify_cookie_csrf(&headers)
  {
    cookie_action.apply_to(resp.headers_mut(), https);
    apply_throttle(resp.headers_mut(), throttle);
    return *resp;
  }
  let mut resp = match state
    .app
    .auth
    .revoke_all_user_sessions(&principal.user().id, "security_action")
    .await
  {
    Ok(()) => auth_session_json_response(StatusCode::CREATED, serde_json::json!({})),
    Err(err) => domain_error_to_http_response(&err),
  };
  cookie_action.apply_to(resp.headers_mut(), https);
  apply_throttle(resp.headers_mut(), throttle);
  resp
}

pub(crate) async fn handle_revoke_auth_session_by_id(
  State(state): State<RouterState>,
  PeerAddr(peer): PeerAddr,
  Path(auth_session_id): Path<String>,
  headers: HeaderMap,
) -> Response {
  let (principal, cookie_action, throttle, https) = match guard_authed_auth(&state, &headers, peer, false).await {
    Ok(v) => v,
    Err(resp) => return *resp,
  };
  if !is_zod_uuid(&auth_session_id) {
    let mut resp = invalid_auth_state_response();
    cookie_action.apply_to(resp.headers_mut(), https);
    apply_throttle(resp.headers_mut(), throttle);
    return resp;
  }
  if matches!(principal, RequestPrincipal::Cookie { .. })
    && let Err(mut resp) = verify_cookie_csrf(&headers)
  {
    cookie_action.apply_to(resp.headers_mut(), https);
    apply_throttle(resp.headers_mut(), throttle);
    return *resp;
  }
  let mut resp = match state
    .app
    .auth
    .revoke_auth_session(&auth_session_id, Some(&principal.user().id), "security_action")
    .await
  {
    Ok(_) => auth_session_json_response(StatusCode::OK, serde_json::json!({})),
    Err(err) => domain_error_to_http_response(&err),
  };
  cookie_action.apply_to(resp.headers_mut(), https);
  apply_throttle(resp.headers_mut(), throttle);
  resp
}
