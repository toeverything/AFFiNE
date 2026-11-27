//! Login OAuth REST routes (`POST /api/oauth/preflight` and `POST /api/oauth/callback`).
use super::auth::{append_auth_cookies, is_native_client_request};
use super::throttle::{PeerAddr, ThrottleSpec, apply_throttle, enforce_throttle_http};
use super::version_guard::extract_non_empty_client_version;
use super::{
  SESSION_COOKIE_NAME, TRUSTED_REDIRECT_DOMAINS, append_clear_auth_cookies, build_allowed_origins,
  domain_error_to_http_response, enforce_named_version_guard, envelope_to_http_response, evaluate_local_redirect,
  extract_cookie, json_utf8_response, parse_cookies, resolve_request_principal_with_policy,
};
use crate::RouterState;
use crate::legacy_compat::errors::LegacyErrorEnvelope;
use axum::Router;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use server_domain::auth::oauth::{OAuthCallbackResult, OAuthPreflightInput, normalize_provider_name};
use server_domain::auth::{OpenAppIssueTarget, OpenAppSignInResult};
use server_types::DomainError;
pub(crate) fn router() -> Router<RouterState> {
  Router::new()
    .route("/api/oauth/preflight", post(handle_oauth_preflight))
    .route("/api/oauth/callback", post(handle_oauth_callback))
}
fn utf16_len(s: &str) -> usize {
  s.encode_utf16().count()
}
fn js_to_string(v: &serde_json::Value) -> String {
  match v {
    serde_json::Value::String(s) => s.clone(),
    serde_json::Value::Null => "null".to_owned(),
    serde_json::Value::Bool(b) => b.to_string(),
    serde_json::Value::Number(n) => n
      .as_f64()
      .map(|f| ryu_js::Buffer::new().format(f).to_owned())
      .unwrap_or_else(|| n.to_string()),
    serde_json::Value::Object(_) => "[object Object]".to_owned(),
    serde_json::Value::Array(arr) => arr
      .iter()
      .map(|e| if e.is_null() { String::new() } else { js_to_string(e) })
      .collect::<Vec<_>>()
      .join(","),
  }
}
fn bad_request(error_type: &str, name: &str, message: impl Into<String>, data: Option<serde_json::Value>) -> Response {
  envelope_to_http_response(LegacyErrorEnvelope {
    status: StatusCode::BAD_REQUEST.as_u16(),
    code: "Bad Request".into(),
    error_type: error_type.into(),
    name: name.into(),
    message: message.into(),
    data,
  })
}
fn missing_oauth_query_parameter(name: &str) -> Response {
  bad_request(
    "BAD_REQUEST",
    "MISSING_OAUTH_QUERY_PARAMETER",
    format!("Missing query parameter `{name}`."),
    Some(serde_json::json!({ "name": name })),
  )
}
fn unknown_oauth_provider(name: &str) -> Response {
  bad_request(
    "INVALID_INPUT",
    "UNKNOWN_OAUTH_PROVIDER",
    format!("Unknown authentication provider {name}."),
    Some(serde_json::json!({ "name": name })),
  )
}
fn map_oauth_domain_error(err: &DomainError) -> Response {
  match err {
    DomainError::Validation(msg) => {
      if let Some(name) = msg.strip_prefix("unknown_oauth_provider:") {
        return unknown_oauth_provider(name);
      }
      if let Some(name) = msg.strip_prefix("missing_oauth_query_parameter:") {
        return missing_oauth_query_parameter(name);
      }
      if msg.starts_with("invalid_oauth_callback_code:") {
        return bad_request(
          "BAD_REQUEST",
          "INVALID_OAUTH_CALLBACK_CODE",
          "Invalid callback code parameter, provider response status: 400 and body: .",
          Some(serde_json::json!({ "status": 400, "body": "" })),
        );
      }
      let (name, msg, data) = match msg.as_str() {
        "invalid_oauth_callback_state" => (
          "INVALID_OAUTH_CALLBACK_STATE",
          "Invalid callback state parameter.",
          None,
        ),
        "oauth_state_expired" => ("OAUTH_STATE_EXPIRED", "OAuth state expired, please try again.", None),
        "invalid_auth_state" => (
          "INVALID_AUTH_STATE",
          "Invalid auth state. You might start the auth progress from another device.",
          None,
        ),
        "invalid_oauth_response" => (
          "INVALID_OAUTH_RESPONSE",
          "Invalid OAuth response: Invalid OAuth response..",
          Some(serde_json::json!({ "reason": "Invalid OAuth response." })),
        ),
        "oauth_account_already_connected" => (
          "OAUTH_ACCOUNT_ALREADY_CONNECTED",
          "The third-party account has already been connected to another user.",
          None,
        ),
        _ => return domain_error_to_http_response(err),
      };
      bad_request("BAD_REQUEST", name, msg, data)
    }
    DomainError::Forbidden(m) if m == "sign_up_forbidden" => envelope_to_http_response(LegacyErrorEnvelope {
      status: StatusCode::FORBIDDEN.as_u16(),
      code: "Forbidden".into(),
      error_type: "ACTION_FORBIDDEN".into(),
      name: "SIGN_UP_FORBIDDEN".into(),
      message: "You are not allowed to sign up.".into(),
      data: None,
    }),
    DomainError::Unauthorized(m) if m == "invalid_auth_state" => bad_request(
      "BAD_REQUEST",
      "INVALID_AUTH_STATE",
      "Invalid auth state. You might start the auth progress from another device.",
      None,
    ),
    _ => domain_error_to_http_response(err),
  }
}
async fn pre_check_oauth(
  state: &RouterState,
  peer: Option<std::net::SocketAddr>,
  headers: &HeaderMap,
) -> Result<
  (
    super::ResolvedRequestPrincipal,
    Option<super::throttle::ThrottleHeaders>,
    bool,
  ),
  Box<Response>,
> {
  let resolved = resolve_request_principal_with_policy(state, headers, true)
    .await
    .map_err(|e| Box::new(e.into_http_response()))?;
  let https = state.app.config.load().https;
  let throttle =
    match enforce_throttle_http(state, headers, peer, resolved.principal.as_ref(), ThrottleSpec::Strict).await {
      Ok(h) => h,
      Err(mut resp) => {
        resolved.cookie_action.apply_to(resp.headers_mut(), https);
        return Err(resp);
      }
    };
  Ok((resolved, throttle, https))
}
/// `POST /api/oauth/preflight` (`@Public()`, `@UseNamedGuard('version')`, `@Throttle('strict')`).
async fn handle_oauth_preflight(
  State(state): State<RouterState>,
  PeerAddr(peer): PeerAddr,
  headers: HeaderMap,
  body_bytes: Bytes,
) -> Response {
  let (resolved, throttle, https) = match pre_check_oauth(&state, peer, &headers).await {
    Ok(v) => v,
    Err(resp) => return *resp,
  };
  let (external_url, server_hosts) = {
    let cfg = state.app.config.load();
    (cfg.external_url.clone(), cfg.app_config_baseline.server.hosts.clone())
  };
  let apply_headers = |mut resp: Response| -> Response {
    resolved.cookie_action.apply_to(resp.headers_mut(), https);
    apply_throttle(resp.headers_mut(), throttle);
    resp
  };
  if let Err(mut resp) = enforce_named_version_guard(&state, &headers, &resolved.cookie_action).await {
    apply_throttle(resp.headers_mut(), throttle);
    return *resp;
  }
  let Some(map) = serde_json::from_slice::<serde_json::Value>(&body_bytes)
    .ok()
    .and_then(|v| v.as_object().cloned())
  else {
    return apply_headers(missing_oauth_query_parameter("provider"));
  };
  let client_nonce = map
    .get("client_nonce")
    .and_then(serde_json::Value::as_str)
    .filter(|s| !s.is_empty() && utf16_len(s) <= 512)
    .map(str::to_owned);
  let client = map
    .get("client")
    .and_then(serde_json::Value::as_str)
    .filter(|s| matches!(*s, "web" | "affine" | "affine-canary" | "affine-beta" | "affine-dev"))
    .map(str::to_owned);
  let provider_raw = map
    .get("provider")
    .and_then(serde_json::Value::as_str)
    .filter(|s| matches!(*s, "Google" | "GitHub" | "Apple" | "OIDC"));
  let (redirect_uri, bad_redirect) = match map.get("redirect_uri") {
    None | Some(serde_json::Value::Null) => (None, false),
    Some(serde_json::Value::String(s)) if !s.is_empty() && utf16_len(s) <= 2048 => (Some(s.clone()), false),
    _ => (None, true),
  };
  let has_unknown = map
    .keys()
    .any(|k| !matches!(k.as_str(), "client_nonce" | "client" | "provider" | "redirect_uri"));
  if client_nonce.is_none() || client.is_none() || provider_raw.is_none() || bad_redirect || has_unknown {
    if client_nonce.is_none() {
      return apply_headers(missing_oauth_query_parameter("client_nonce"));
    }
    if client.is_none() {
      return apply_headers(domain_error_to_http_response(&DomainError::Forbidden(
        "You are not allowed to perform this action.".to_owned(),
      )));
    }
    if provider_raw.is_none() {
      let raw_p = map.get("provider").map_or_else(String::new, js_to_string);
      return apply_headers(unknown_oauth_provider(&raw_p));
    }
    return apply_headers(missing_oauth_query_parameter("provider"));
  }
  let (client_nonce, client, provider_raw) = (client_nonce.unwrap(), client.unwrap(), provider_raw.unwrap());
  let (provider, _) = match normalize_provider_name(provider_raw) {
    Ok(p) => p,
    Err(_) => return apply_headers(unknown_oauth_provider(provider_raw)),
  };
  let base = external_url.trim_end_matches('/');
  let callback_url = if provider == "apple" {
    format!("{base}/api/oauth/callback")
  } else {
    format!("{base}/oauth/callback")
  };
  let resp = match state
    .app
    .auth
    .oauth_preflight(OAuthPreflightInput {
      provider: provider.to_owned(),
      redirect_uri,
      client,
      client_nonce,
      client_version: extract_non_empty_client_version(&headers),
      callback_url,
      redirect_base_url: external_url.clone(),
      redirect_allowed_origins: build_allowed_origins(&external_url, &server_hosts),
      redirect_trusted_domains: TRUSTED_REDIRECT_DOMAINS.iter().map(|s| (*s).to_owned()).collect(),
    })
    .await
  {
    Ok(ok) => json_utf8_response(StatusCode::OK, ok, false),
    Err(err) => map_oauth_domain_error(&err),
  };
  apply_headers(resp)
}
fn parse_callback_map(headers: &HeaderMap, body_bytes: &[u8]) -> Option<serde_json::Map<String, serde_json::Value>> {
  let content_type = headers
    .get(header::CONTENT_TYPE)
    .and_then(|v| v.to_str().ok())
    .unwrap_or("");
  if content_type.starts_with("application/x-www-form-urlencoded") {
    let mut map = serde_json::Map::new();
    for (k, v) in url::form_urlencoded::parse(body_bytes) {
      map.insert(k.into_owned(), serde_json::Value::String(v.into_owned()));
    }
    return Some(map);
  }
  serde_json::from_slice::<serde_json::Value>(body_bytes)
    .ok()
    .and_then(|v| v.as_object().cloned())
}
/// `POST /api/oauth/callback` (`@Public()`, `@Throttle('strict')`, intentionally NO `@UseNamedGuard('version')`).
async fn handle_oauth_callback(
  State(state): State<RouterState>,
  PeerAddr(peer): PeerAddr,
  headers: HeaderMap,
  body_bytes: Bytes,
) -> Response {
  let (resolved, throttle, https) = match pre_check_oauth(&state, peer, &headers).await {
    Ok(v) => v,
    Err(resp) => return *resp,
  };
  let external_url = state.app.config.load().external_url.clone();
  let apply_headers = |mut resp: Response| -> Response {
    resolved.cookie_action.apply_to(resp.headers_mut(), https);
    apply_throttle(resp.headers_mut(), throttle);
    resp
  };
  let Some(map) = parse_callback_map(&headers, &body_bytes) else {
    return apply_headers(missing_oauth_query_parameter("state"));
  };
  let code = map
    .get("code")
    .and_then(serde_json::Value::as_str)
    .filter(|s| !s.is_empty() && utf16_len(s) <= 4096)
    .map(str::to_owned);
  let raw_state = map
    .get("state")
    .and_then(serde_json::Value::as_str)
    .filter(|s| !s.is_empty() && utf16_len(s) <= 16_384)
    .map(str::to_owned);
  let (client_nonce, bad_nonce) = match map.get("client_nonce") {
    None | Some(serde_json::Value::Null) => (None, false),
    Some(serde_json::Value::String(s)) if !s.is_empty() && utf16_len(s) <= 512 => (Some(s.clone()), false),
    _ => (None, true),
  };
  let bad_user = match map.get("user") {
    None => false,
    Some(serde_json::Value::String(s)) => utf16_len(s) > 16_384,
    Some(_) => true,
  };
  let has_unknown = map
    .keys()
    .any(|k| !matches!(k.as_str(), "code" | "state" | "client_nonce" | "user"));
  if code.is_none() || raw_state.is_none() || bad_nonce || bad_user || has_unknown {
    return apply_headers(missing_oauth_query_parameter(if code.is_none() {
      "code"
    } else {
      "state"
    }));
  }
  let (code, raw_state) = (code.unwrap(), raw_state.unwrap());
  let client_version = extract_non_empty_client_version(&headers);
  let cookies = parse_cookies(&headers);
  let existing_session_id = extract_cookie(&cookies, SESSION_COOKIE_NAME);
  let target = if is_native_client_request(&headers) {
    OpenAppIssueTarget::Native {
      client_version: client_version.as_deref(),
    }
  } else {
    OpenAppIssueTarget::Cookie {
      existing_session_id,
      client_version: client_version.as_deref(),
    }
  };
  match state
    .app
    .auth
    .oauth_callback(&code, &raw_state, client_nonce.as_deref(), target)
    .await
  {
    Ok(OAuthCallbackResult::Handoff {
      code,
      provider,
      state_token,
      client,
    }) => {
      let mut client_url = url::Url::parse(&format!("{client}://authentication"))
        .unwrap_or_else(|_| url::Url::parse("affine://authentication").expect("valid fallback"));
      let payload = serde_json::json!({ "state": state_token, "code": code, "provider": provider }).to_string();
      let server_origin = url::Url::parse(&external_url)
        .map(|u| u.origin().ascii_serialization())
        .unwrap_or_else(|_| external_url.clone());
      client_url.query_pairs_mut().extend_pairs([
        ("method", "oauth"),
        ("payload", payload.as_str()),
        ("server", server_origin.as_str()),
      ]);
      let mut redirect_url = url::Url::parse(&format!("{}/open-app/url", external_url.trim_end_matches('/')))
        .unwrap_or_else(|_| url::Url::parse("http://localhost/open-app/url").expect("valid fallback"));
      redirect_url.query_pairs_mut().append_pair("url", client_url.as_str());
      let mut resp = StatusCode::FOUND.into_response();
      if let Ok(loc) = HeaderValue::from_str(redirect_url.as_str()) {
        resp.headers_mut().insert(header::LOCATION, loc);
      }
      apply_headers(resp)
    }
    Ok(OAuthCallbackResult::Login {
      session,
      redirect_uri,
      provider,
      client,
    }) => {
      let mut resp = if provider == "apple" && (client.is_empty() || client == "web") {
        let target_loc = evaluate_local_redirect(redirect_uri.as_deref().unwrap_or("/"), &external_url);
        let mut r = StatusCode::FOUND.into_response();
        if let Ok(loc) = HeaderValue::from_str(&target_loc) {
          r.headers_mut().insert(header::LOCATION, loc);
        }
        match &session {
          OpenAppSignInResult::Cookie(cookie) => append_auth_cookies(r.headers_mut(), cookie, https),
          OpenAppSignInResult::Native { .. } => append_clear_auth_cookies(r.headers_mut(), https),
        }
        r
      } else {
        let (mut dto, cookie_opt) = match session {
          OpenAppSignInResult::Cookie(cookie) => (serde_json::json!({ "id": cookie.user.id }), Some(cookie)),
          OpenAppSignInResult::Native { user, exchange_code } => (
            serde_json::json!({ "id": user.id, "exchangeCode": exchange_code }),
            None,
          ),
        };
        if let Some(uri) = redirect_uri {
          dto["redirectUri"] = serde_json::Value::String(uri);
        }
        let mut r = json_utf8_response(StatusCode::OK, dto, false);
        match cookie_opt {
          Some(cookie) => append_auth_cookies(r.headers_mut(), &cookie, https),
          None => append_clear_auth_cookies(r.headers_mut(), https),
        }
        r
      };
      apply_throttle(resp.headers_mut(), throttle);
      resp
    }
    Err(err) => apply_headers(map_oauth_domain_error(&err)),
  }
}
