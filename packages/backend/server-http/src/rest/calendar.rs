//! Calendar REST routes (`/api/calendar/oauth/{preflight,callback}` and
//! `/api/calendar/webhook/google`) aligned with `v0.27.5`
//! `plugins/calendar/controller.ts`.
use crate::RouterState;
use crate::graphql::calendar::{
  calendar_error_to_envelope, calendar_oauth_store_from_state, calendar_service_from_state,
};
use crate::legacy_compat::errors::LegacyErrorEnvelope;
use crate::rest::{
  PrincipalCookieAction, calendar_callback_origin, calendar_request_origin, domain_error_to_http_response,
  envelope_to_http_response, json_utf8_response, resolve_request_principal_with_policy,
  validate_and_build_calendar_redirect_uri,
};
use axum::extract::{Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;
use server_domain::calendar::oauth::{CalendarOAuthState, is_valid_oauth_state};
use server_domain::calendar::{CalendarError, CalendarProviderName};
use server_types::DomainError;
pub(crate) fn router() -> Router<RouterState> {
  Router::new()
    .route("/api/calendar/oauth/preflight", post(handle_oauth_preflight))
    .route(
      "/api/calendar/oauth/callback",
      get(handle_oauth_callback_get).post(handle_oauth_callback_post),
    )
    .route("/api/calendar/webhook/google", post(handle_google_webhook))
}
#[derive(Debug, Deserialize)]
struct PreflightBody {
  provider: Option<String>,
  redirect_uri: Option<String>,
}
#[derive(Debug, Deserialize)]
struct CallbackParams {
  code: Option<String>,
  state: Option<String>,
}
fn cal_err_resp(err: &CalendarError) -> Response {
  envelope_to_http_response(calendar_error_to_envelope(err))
}
fn with_cookies(mut resp: Response, action: &PrincipalCookieAction, https: bool) -> Response {
  action.apply_to(resp.headers_mut(), https);
  resp
}
fn oauth_bad_request(error_type: &str, name: &str, message: String, data: Option<serde_json::Value>) -> Response {
  envelope_to_http_response(LegacyErrorEnvelope {
    status: StatusCode::BAD_REQUEST.as_u16(),
    code: "Bad Request".to_owned(),
    error_type: error_type.to_owned(),
    name: name.to_owned(),
    message,
    data,
  })
}
fn missing_oauth_param(name: &str) -> Response {
  let msg = format!("Missing query parameter `{name}`.");
  oauth_bad_request(
    "BAD_REQUEST",
    "MISSING_OAUTH_QUERY_PARAMETER",
    msg,
    Some(json!({ "name": name })),
  )
}
fn unknown_oauth_provider(name: &str) -> Response {
  let msg = format!("Unknown authentication provider {name}.");
  oauth_bad_request(
    "INVALID_INPUT",
    "UNKNOWN_OAUTH_PROVIDER",
    msg,
    Some(json!({ "name": name })),
  )
}
fn safe_redirect_response(state: &RouterState, headers: &HeaderMap, raw_location: &str) -> Response {
  let cfg = state.app.config.load();
  let fallback = cfg.external_url.trim_end_matches('/');
  let req_host = headers.get(header::HOST).and_then(|v| v.to_str().ok());
  let matches_base = |target: &url::Url, base: &url::Url| {
    let bp = base.path().trim_end_matches('/');
    target.origin() == base.origin()
      && (bp.is_empty() || target.path() == bp || target.path().starts_with(&format!("{bp}/")))
  };
  let canonical = url::Url::parse(fallback)
    .ok()
    .and_then(|ext_base| {
      let (origin, path) = calendar_request_origin(
        &cfg.external_url,
        &cfg.app_config_baseline.server.hosts,
        cfg.app_config_baseline.server.port,
        req_host,
      )?;
      let req_base = url::Url::parse(&format!("{origin}{path}")).ok()?;
      let target = req_base.join(raw_location).ok()?;
      let ok_scheme =
        matches!(target.scheme(), "http" | "https") && target.username().is_empty() && target.password().is_none();
      (ok_scheme && matches_base(&target, &ext_base)).then(|| target.to_string())
    })
    .unwrap_or_else(|| fallback.to_owned());
  let mut resp = StatusCode::FOUND.into_response();
  if let Ok(val) = HeaderValue::from_str(&canonical) {
    resp.headers_mut().insert(header::LOCATION, val);
  }
  resp
}
fn callback_error_message(err: &CalendarError) -> String {
  match err {
    CalendarError::ProviderRequest { status: 403, .. } => {
      "Calendar authorization failed: insufficient permissions. Please reauthorize and allow Calendar access."
        .to_owned()
    }
    CalendarError::BadRequest { message, .. } if !message.is_empty() => message.clone(),
    CalendarError::BadRequest { .. } => "Calendar authorization failed.".to_owned(),
    _ => "Calendar authorization failed. Please try again.".to_owned(),
  }
}
async fn handle_oauth_preflight(
  State(state): State<RouterState>,
  headers: HeaderMap,
  Json(body): Json<PreflightBody>,
) -> Response {
  let https = state.app.config.load().https;
  let resolved = match resolve_request_principal_with_policy(&state, &headers, false).await {
    Ok(r) => r,
    Err(err) => return err.into_http_response(),
  };
  let cookie_action = resolved.cookie_action;
  let Some(principal) = resolved.principal else {
    return with_cookies(
      domain_error_to_http_response(&DomainError::Unauthorized("Authentication required".to_owned())),
      &cookie_action,
      https,
    );
  };
  let user = principal.into_user();
  let Some(provider_raw) = body.provider.as_deref().filter(|s| !s.trim().is_empty()) else {
    return with_cookies(missing_oauth_param("provider"), &cookie_action, https);
  };
  let Some(provider) = CalendarProviderName::parse(provider_raw) else {
    return with_cookies(unknown_oauth_provider(provider_raw), &cookie_action, https);
  };
  let svc = calendar_service_from_state(&state.app);
  match svc.is_oauth_provider_available(provider).await {
    Ok(true) => {}
    Ok(false) => return with_cookies(unknown_oauth_provider(provider_raw), &cookie_action, https),
    Err(err) => return with_cookies(cal_err_resp(&err), &cookie_action, https),
  }
  if let Err(err) = svc.assert_can_link_provider(&user.id, provider).await {
    return with_cookies(cal_err_resp(&err), &cookie_action, https);
  }
  let req_host = headers.get(header::HOST).and_then(|v| v.to_str().ok());
  let cfg = state.app.config.load();
  let canonical_redirect = match body.redirect_uri.as_deref().filter(|s| !s.is_empty()) {
    Some(raw) => match validate_and_build_calendar_redirect_uri(
      raw,
      &cfg.external_url,
      &cfg.app_config_baseline.server.hosts,
      cfg.app_config_baseline.server.port,
      req_host,
      &[],
    ) {
      Ok(url) => Some(url),
      Err(err) => return with_cookies(domain_error_to_http_response(&err), &cookie_action, https),
    },
    None => None,
  };
  let oauth = match calendar_oauth_store_from_state(&state.app) {
    Ok(store) => store,
    Err(err) => return with_cookies(domain_error_to_http_response(&err), &cookie_action, https),
  };
  let state_token = match oauth
    .save_oauth_state(CalendarOAuthState {
      provider,
      user_id: user.id,
      redirect_uri: canonical_redirect,
      token: None,
    })
    .await
  {
    Ok(t) => t,
    Err(err) => return with_cookies(domain_error_to_http_response(&err), &cookie_action, https),
  };
  let cb_origin = calendar_callback_origin(
    &cfg.external_url,
    &cfg.app_config_baseline.server.hosts,
    cfg.app_config_baseline.server.port,
    req_host,
  );
  let callback_url = svc.callback_url_for(&cb_origin);
  let resp = match svc.get_auth_url(provider, &state_token, &callback_url).await {
    Ok(auth_url) => json_utf8_response(StatusCode::OK, json!({ "url": auth_url }), true),
    Err(err) => envelope_to_http_response(calendar_error_to_envelope(&err)),
  };
  with_cookies(resp, &cookie_action, https)
}
async fn handle_oauth_callback_get(
  State(state): State<RouterState>,
  headers: HeaderMap,
  Query(params): Query<CallbackParams>,
) -> Response {
  handle_oauth_callback(&state, &headers, params.code, params.state).await
}
async fn handle_oauth_callback_post(
  State(state): State<RouterState>,
  headers: HeaderMap,
  Json(params): Json<CallbackParams>,
) -> Response {
  handle_oauth_callback(&state, &headers, params.code, params.state).await
}
async fn handle_oauth_callback(
  state: &RouterState,
  headers: &HeaderMap,
  code: Option<String>,
  state_str: Option<String>,
) -> Response {
  let https = state.app.config.load().https;
  let cookie_action = match resolve_request_principal_with_policy(state, headers, true).await {
    Ok(r) => r.cookie_action,
    Err(err) => return err.into_http_response(),
  };
  let Some(code) = code.filter(|c| !c.is_empty()) else {
    return with_cookies(missing_oauth_param("code"), &cookie_action, https);
  };
  let Some(state_str) = state_str.filter(|s| !s.is_empty()) else {
    return with_cookies(missing_oauth_param("state"), &cookie_action, https);
  };
  if !is_valid_oauth_state(&state_str) {
    return with_cookies(missing_oauth_param("state"), &cookie_action, https);
  }
  let oauth = match calendar_oauth_store_from_state(&state.app) {
    Ok(store) => store,
    Err(err) => return with_cookies(domain_error_to_http_response(&err), &cookie_action, https),
  };
  // Non-destructive read so transient upstream failures remain retryable within TTL.
  let Some(oauth_state) = (match oauth.get_oauth_state(&state_str).await {
    Ok(val) => val,
    Err(err) => return with_cookies(domain_error_to_http_response(&err), &cookie_action, https),
  }) else {
    let msg = "OAuth state expired, please try again.".to_owned();
    return with_cookies(
      oauth_bad_request("BAD_REQUEST", "OAUTH_STATE_EXPIRED", msg, None),
      &cookie_action,
      https,
    );
  };
  let svc = calendar_service_from_state(&state.app);
  let cfg = state.app.config.load();
  let req_host = headers.get(header::HOST).and_then(|v| v.to_str().ok());
  let cb_origin = calendar_callback_origin(
    &cfg.external_url,
    &cfg.app_config_baseline.server.hosts,
    cfg.app_config_baseline.server.port,
    req_host,
  );
  let callback_url = svc.callback_url_for(&cb_origin);
  if let Err(err) = svc
    .handle_oauth_callback(oauth_state.provider, &code, &callback_url, &oauth_state.user_id)
    .await
  {
    if let Some(ref redirect_uri) = oauth_state.redirect_uri {
      let msg = callback_error_message(&err);
      let canonical = match validate_and_build_calendar_redirect_uri(
        redirect_uri,
        &cfg.external_url,
        &cfg.app_config_baseline.server.hosts,
        cfg.app_config_baseline.server.port,
        req_host,
        &[("error", msg.as_str())],
      ) {
        Ok(u) => u,
        Err(e) => return with_cookies(domain_error_to_http_response(&e), &cookie_action, https),
      };
      return with_cookies(
        safe_redirect_response(state, headers, &canonical),
        &cookie_action,
        https,
      );
    }
    return with_cookies(cal_err_resp(&err), &cookie_action, https);
  }
  if let Some(ref redirect_uri) = oauth_state.redirect_uri {
    return with_cookies(
      safe_redirect_response(state, headers, redirect_uri),
      &cookie_action,
      https,
    );
  }
  with_cookies(
    json_utf8_response(StatusCode::OK, json!({ "ok": true }), true),
    &cookie_action,
    https,
  )
}
async fn handle_google_webhook(State(state): State<RouterState>, headers: HeaderMap) -> Response {
  let https = state.app.config.load().https;
  let cookie_action = match resolve_request_principal_with_policy(&state, &headers, true).await {
    Ok(r) => r.cookie_action,
    Err(err) => return err.into_http_response(),
  };
  let svc = calendar_service_from_state(&state.app);
  let configs = match svc.load_configs().await {
    Ok(cfg) => cfg,
    Err(err) => return with_cookies(cal_err_resp(&err), &cookie_action, https),
  };
  if svc.webhook_address_from_config(&configs.google, "google").is_none() {
    return with_cookies(StatusCode::OK.into_response(), &cookie_action, https);
  }
  let Some(channel_id) = headers
    .get("x-goog-channel-id")
    .and_then(|v| v.to_str().ok())
    .map(str::trim)
    .filter(|s| !s.is_empty())
  else {
    return with_cookies(StatusCode::OK.into_response(), &cookie_action, https);
  };
  let token = headers
    .get("x-goog-channel-token")
    .and_then(|v| v.to_str().ok())
    .unwrap_or_default();
  if !svc.verify_webhook_token(&configs.google, token).await {
    return with_cookies(StatusCode::UNAUTHORIZED.into_response(), &cookie_action, https);
  }
  match svc.handle_webhook(CalendarProviderName::Google, channel_id).await {
    Ok(()) => with_cookies(StatusCode::OK.into_response(), &cookie_action, https),
    Err(err) => with_cookies(cal_err_resp(&err), &cookie_action, https),
  }
}
