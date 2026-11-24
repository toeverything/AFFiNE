//! Captcha challenge REST endpoint (`GET /api/auth/captcha`) and
//! `@UseNamedGuard('captcha')` guard enforcement.
use super::throttle::{ThrottleSpec, enforce_throttle_http};
use super::{
  PrincipalCookieAction, domain_error_to_http_response, envelope_to_http_response, json_utf8_response,
  resolve_auth_request_source, resolve_request_principal_with_policy,
};
use crate::RouterState;
use crate::legacy_compat::errors::LegacyErrorEnvelope;
use axum::Router;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use axum::routing::get;
use serde_json::json;
use server_domain::auth::captcha::{
  CaptchaVerificationRequest, create_hashcash_challenge, load_effective_captcha_config, verify_captcha,
};
use server_types::DomainError;
pub(crate) fn router() -> Router<RouterState> {
  Router::new().route("/api/auth/captcha", get(handle_get_captcha))
}
async fn handle_get_captcha(
  State(state): State<RouterState>,
  super::throttle::PeerAddr(peer): super::throttle::PeerAddr,
  headers: HeaderMap,
) -> Response {
  let resolved = match resolve_request_principal_with_policy(&state, &headers, true).await {
    Ok(r) => r,
    Err(err) => return err.into_http_response(),
  };
  let https = state.app.config.load().https;
  let principal = resolved.principal.as_ref();
  let throttle = match enforce_throttle_http(&state, &headers, peer, principal, ThrottleSpec::Strict).await {
    Ok(h) => h,
    Err(mut resp) => {
      resolved.cookie_action.apply_to(resp.headers_mut(), https);
      return *resp;
    }
  };
  let native = headers.get("x-affine-client-kind").and_then(|v| v.to_str().ok()) == Some("native");
  let mut resp = if native {
    match create_hashcash_challenge(&state.app.db).await {
      Ok(c) => json_utf8_response(
        StatusCode::OK,
        json!({ "provider": "hashcash", "challenge": c.challenge, "resource": c.resource }),
        true,
      ),
      Err(err) => domain_error_to_http_response(&err),
    }
  } else {
    match load_effective_captcha_config(&state.app.db).await {
      Ok(e) => json_utf8_response(
        StatusCode::OK,
        json!({ "provider": "turnstile", "siteKey": e.config.turnstile.site_key, "action": e.config.turnstile.action }),
        true,
      ),
      Err(err) => domain_error_to_http_response(&err),
    }
  };
  resolved.cookie_action.apply_to(resp.headers_mut(), https);
  super::throttle::apply_throttle(resp.headers_mut(), throttle);
  resp
}
fn captcha_failed_response(message: &str) -> Response {
  envelope_to_http_response(LegacyErrorEnvelope {
    status: StatusCode::BAD_REQUEST.as_u16(),
    code: "Bad Request".into(),
    error_type: "BAD_REQUEST".into(),
    name: "CAPTCHA_VERIFICATION_FAILED".into(),
    message: message.to_owned(),
    data: None,
  })
}
pub(crate) async fn enforce_named_captcha_guard(
  state: &RouterState,
  headers: &HeaderMap,
  pending_cookie_action: &PrincipalCookieAction,
) -> Result<(), Box<Response>> {
  let (https, dev_mode, mut allowed_hosts) = {
    let cfg = state.app.config.load();
    let mut hosts = cfg.app_config_baseline.server.hosts.clone();
    hosts.push(cfg.app_config_baseline.server.host.clone());
    (cfg.https, cfg.dev_mode, hosts)
  };
  let fail = |mut resp: Response| -> Result<(), Box<Response>> {
    pending_cookie_action.apply_to(resp.headers_mut(), https);
    Err(Box::new(resp))
  };
  let effective = match load_effective_captcha_config(&state.app.db).await {
    Ok(v) => v,
    Err(err) => return fail(domain_error_to_http_response(&err)),
  };
  if !effective.enabled {
    return Ok(());
  }
  let hdr = |name: &str| headers.get(name).and_then(|v| v.to_str().ok()).map(str::trim);
  let (token, challenge, provider) = (
    hdr("x-captcha-token").unwrap_or(""),
    hdr("x-captcha-challenge").filter(|s| !s.is_empty()),
    hdr("x-captcha-provider").unwrap_or(""),
  );
  if token.is_empty()
    || token.len() > 2048
    || challenge.is_some_and(|c| c.len() > 128)
    || !matches!(provider, "hashcash" | "turnstile")
  {
    return fail(captcha_failed_response("Invalid Credential"));
  }
  allowed_hosts.retain(|h| !h.is_empty());
  let ip = resolve_auth_request_source(state, headers).await.ip;
  match verify_captcha(
    &state.app.db,
    &effective.config,
    &CaptchaVerificationRequest {
      provider: provider.to_owned(),
      token: token.to_owned(),
      challenge: challenge.map(str::to_owned),
      ip,
      allowed_hosts,
      dev_mode,
    },
  )
  .await
  {
    Ok(true) => Ok(()),
    Err(DomainError::Unavailable(m)) if m == "captcha_provider_unavailable" => {
      fail(envelope_to_http_response(LegacyErrorEnvelope {
        status: StatusCode::GATEWAY_TIMEOUT.as_u16(),
        code: "Gateway Timeout".into(),
        error_type: "NETWORK_ERROR".into(),
        name: "NETWORK_ERROR".into(),
        message: "Captcha verification temporarily unavailable".into(),
        data: None,
      }))
    }
    Ok(false) | Err(_) => fail(captcha_failed_response("Invalid Captcha Response")),
  }
}
