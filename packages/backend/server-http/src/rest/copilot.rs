//! Official `v0.27.5` `/api/copilot/*` REST & SSE routes.

use std::collections::BTreeMap;
use std::convert::Infallible;
use std::time::Duration;

use axum::Router;
use axum::body::Body;
use axum::extract::{DefaultBodyLimit, Path, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::sse::{Event, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, put};
use futures_util::{StreamExt as _, stream};
use serde::{Deserialize, Serialize};
use server_domain::safe_fetch::{SafeFetchPolicy, SafeFetchRequest, safe_fetch};
use server_spi::{
  CopilotSseFrame, CopilotStreamSpiInput, DownloadCopilotAttachmentSpiInput, PreparedCopilotSseStream,
  UploadCopilotAttachmentSpiInput,
};
use server_types::DomainError;

use super::throttle::{ThrottleHeaders, ThrottleSpec, apply_throttle, enforce_throttle_http};
use super::{
  PrincipalCookieAction, apply_blob_security_headers, domain_error_to_http_response, envelope_to_http_response,
  json_utf8_response, resolve_request_principal_with_policy,
};
use crate::RouterState;
use crate::graphql::copilot::enforce_copilot_enabled;
use crate::legacy_compat::errors::{domain_error_to_envelope, safe_fetch_error_to_envelope};

const MAX_ATTACHMENT_BYTES: usize = 20 * 1024 * 1024;
const MAX_ATTACHMENT_BODY_LIMIT: usize = 21 * 1024 * 1024;
const SSE_PING_INTERVAL: Duration = Duration::from_secs(5);
const UNSPLASH_TIMEOUT: Duration = Duration::from_secs(15);
const UNSPLASH_MAX_RESPONSE_BYTES: usize = 5 * 1024 * 1024;

#[derive(Clone, Copy)]
enum SseStreamKind {
  Chat,
  Object,
  Action,
  Images,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadAttachmentQuery {
  workspace_id: Option<String>,
  mime_type: Option<String>,
  file_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadAttachmentQuery {
  workspace_id: Option<String>,
  file_name: Option<String>,
}

#[derive(Serialize)]
struct AttachmentUrlResponse {
  url: String,
}

pub(crate) fn router() -> Router<RouterState> {
  let attachment_upload = Router::new()
    .route(
      "/api/copilot/chat/{session_id}/attachments/{key}",
      put(handle_upload_attachment).get(handle_download_attachment),
    )
    .layer(DefaultBodyLimit::max(MAX_ATTACHMENT_BODY_LIMIT));

  Router::new()
    .route("/api/copilot/chat/{session_id}/stream", get(handle_chat_stream))
    .route(
      "/api/copilot/chat/{session_id}/stream-object",
      get(handle_object_stream),
    )
    .route("/api/copilot/actions/{session_id}/stream", get(handle_action_stream))
    .route("/api/copilot/chat/{session_id}/images", get(handle_images_stream))
    .route("/api/copilot/unsplash/photos", get(handle_unsplash_photos))
    .merge(attachment_upload)
}

async fn authorize_copilot_request(
  state: &RouterState,
  headers: &HeaderMap,
  throttle_authenticated: bool,
) -> Result<(String, PrincipalCookieAction, Option<ThrottleHeaders>), Box<Response>> {
  let resolved = match resolve_request_principal_with_policy(state, headers, false).await {
    Ok(r) => r,
    Err(err) => return Err(Box::new(err.into_http_response())),
  };
  let https = state.app.config.load().https;
  let Some(principal) = resolved.principal else {
    let mut resp = domain_error_to_http_response(&DomainError::Unauthorized("Authentication required".into()));
    resolved.cookie_action.apply_to(resp.headers_mut(), https);
    return Err(Box::new(resp));
  };
  let throttle = if throttle_authenticated {
    match enforce_throttle_http(state, headers, None, Some(&principal), ThrottleSpec::Default).await {
      Ok(h) => h,
      Err(mut resp) => {
        resolved.cookie_action.apply_to(resp.headers_mut(), https);
        return Err(resp);
      }
    }
  } else {
    None
  };
  if let Err(err) = enforce_copilot_enabled(&state.app).await {
    let mut resp = domain_error_to_http_response(&err);
    apply_throttle(resp.headers_mut(), throttle);
    resolved.cookie_action.apply_to(resp.headers_mut(), https);
    return Err(Box::new(resp));
  }
  Ok((principal.user().id.clone(), resolved.cookie_action, throttle))
}

fn sse_error_event(err: &DomainError, id: Option<&str>) -> Event {
  let env = domain_error_to_envelope(err);
  let json = serde_json::to_string(&env).unwrap_or_else(|_| r#"{"status":500,"name":"INTERNAL_SERVER_ERROR"}"#.into());
  let mut ev = Event::default().event("error").data(json);
  if let Some(id) = id {
    ev = ev.id(id);
  }
  ev
}

fn sse_single_error_response(
  err: &DomainError,
  cookie_action: &PrincipalCookieAction,
  throttle: Option<ThrottleHeaders>,
  https: bool,
) -> Response {
  let ev = sse_error_event(err, None);
  let s = stream::once(async move { Ok::<Event, Infallible>(ev) });
  let mut resp = Sse::new(s).into_response();
  resp
    .headers_mut()
    .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
  apply_throttle(resp.headers_mut(), throttle);
  cookie_action.apply_to(resp.headers_mut(), https);
  resp
}

fn sse_prepared_response(
  prepared: PreparedCopilotSseStream,
  cookie_action: &PrincipalCookieAction,
  throttle: Option<ThrottleHeaders>,
  https: bool,
) -> Response {
  let message_id = prepared.message_id;
  let mut inner = prepared.stream;
  let (tx, rx) = tokio::sync::mpsc::channel::<Result<Event, Infallible>>(32);

  tokio::spawn(async move {
    let mut ping = tokio::time::interval(SSE_PING_INTERVAL);
    ping.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    // Skip immediate first tick so ping fires after 5s.
    ping.tick().await;
    loop {
      tokio::select! {
        _ = ping.tick() => {
          let ev = Event::default().event("ping").id(message_id.clone()).data("");
          if tx.send(Ok(ev)).await.is_err() {
            break;
          }
        }
        item = inner.next() => {
          match item {
            Some(Ok(CopilotSseFrame::Message { id, data })) => {
              let ev = Event::default()
                .event("message")
                .id(id.unwrap_or_else(|| message_id.clone()))
                .data(data);
              if tx.send(Ok(ev)).await.is_err() {
                break;
              }
            }
            Some(Ok(CopilotSseFrame::Attachment { id, data })) => {
              let ev = Event::default()
                .event("attachment")
                .id(id.unwrap_or_else(|| message_id.clone()))
                .data(data);
              if tx.send(Ok(ev)).await.is_err() {
                break;
              }
            }
            Some(Ok(CopilotSseFrame::Event { id, data })) => {
              let payload = serde_json::to_string(&data).unwrap_or_else(|_| "{}".into());
              let ev = Event::default()
                .event("event")
                .id(id.unwrap_or_else(|| message_id.clone()))
                .data(payload);
              if tx.send(Ok(ev)).await.is_err() {
                break;
              }
            }
            Some(Ok(CopilotSseFrame::Error { id, data })) => {
              let payload = serde_json::to_string(&data).unwrap_or_else(|_| "{}".into());
              let ev = Event::default()
                .event("error")
                .id(id.unwrap_or_else(|| message_id.clone()))
                .data(payload);
              let _ = tx.send(Ok(ev)).await;
              break;
            }
            Some(Err(err)) => {
              let _ = tx.send(Ok(sse_error_event(&err, Some(&message_id)))).await;
              break;
            }
            None => break,
          }
        }
      }
    }
  });

  let stream = stream::unfold(rx, |mut rx| async move { rx.recv().await.map(|item| (item, rx)) });
  let mut resp = Sse::new(stream).into_response();
  resp
    .headers_mut()
    .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
  apply_throttle(resp.headers_mut(), throttle);
  cookie_action.apply_to(resp.headers_mut(), https);
  resp
}

async fn handle_sse_stream(
  state: RouterState,
  headers: HeaderMap,
  session_id: String,
  query: BTreeMap<String, String>,
  kind: SseStreamKind,
) -> Response {
  let (user_id, cookie_action, throttle) = match authorize_copilot_request(&state, &headers, true).await {
    Ok(ok) => ok,
    Err(resp) => return *resp,
  };
  let https = state.app.config.load().https;
  let input = CopilotStreamSpiInput {
    user_id,
    session_id,
    query,
  };
  let runtime = state.app.extension.copilot_runtime();
  let prepared = match kind {
    SseStreamKind::Chat => runtime.prepare_chat_stream(input).await,
    SseStreamKind::Object => runtime.prepare_object_stream(input).await,
    SseStreamKind::Action => runtime.prepare_action_stream(input).await,
    SseStreamKind::Images => runtime.prepare_images_stream(input).await,
  };
  match prepared {
    Ok(stream) => sse_prepared_response(stream, &cookie_action, throttle, https),
    Err(err) => sse_single_error_response(&err, &cookie_action, throttle, https),
  }
}

async fn handle_chat_stream(
  State(state): State<RouterState>,
  headers: HeaderMap,
  Path(session_id): Path<String>,
  Query(query): Query<BTreeMap<String, String>>,
) -> Response {
  handle_sse_stream(state, headers, session_id, query, SseStreamKind::Chat).await
}

async fn handle_object_stream(
  State(state): State<RouterState>,
  headers: HeaderMap,
  Path(session_id): Path<String>,
  Query(query): Query<BTreeMap<String, String>>,
) -> Response {
  handle_sse_stream(state, headers, session_id, query, SseStreamKind::Object).await
}

async fn handle_action_stream(
  State(state): State<RouterState>,
  headers: HeaderMap,
  Path(session_id): Path<String>,
  Query(query): Query<BTreeMap<String, String>>,
) -> Response {
  handle_sse_stream(state, headers, session_id, query, SseStreamKind::Action).await
}

async fn handle_images_stream(
  State(state): State<RouterState>,
  headers: HeaderMap,
  Path(session_id): Path<String>,
  Query(query): Query<BTreeMap<String, String>>,
) -> Response {
  handle_sse_stream(state, headers, session_id, query, SseStreamKind::Images).await
}

async fn handle_unsplash_photos(
  State(state): State<RouterState>,
  headers: HeaderMap,
  Query(params): Query<BTreeMap<String, String>>,
) -> Response {
  let (_user_id, cookie_action, throttle) = match authorize_copilot_request(&state, &headers, true).await {
    Ok(ok) => ok,
    Err(resp) => return *resp,
  };
  let https = state.app.config.load().https;
  let effective_cfg = match state.app.app_config.get_effective_app_config().await {
    Ok(cfg) => cfg,
    Err(err) => {
      let mut resp = domain_error_to_http_response(&err);
      apply_throttle(resp.headers_mut(), throttle);
      cookie_action.apply_to(resp.headers_mut(), https);
      return resp;
    }
  };
  let key = effective_cfg
    .pointer("/copilot/unsplash/key")
    .and_then(|v| v.as_str())
    .map(str::trim)
    .filter(|s| !s.is_empty());
  let Some(key) = key else {
    let mut resp = domain_error_to_http_response(&DomainError::Internal("unsplash_is_not_configured".into()));
    apply_throttle(resp.headers_mut(), throttle);
    cookie_action.apply_to(resp.headers_mut(), https);
    return resp;
  };

  let mut target = match url::Url::parse("https://api.unsplash.com/search/photos") {
    Ok(u) => u,
    Err(_) => {
      let mut resp = domain_error_to_http_response(&DomainError::Internal("invalid unsplash url".into()));
      apply_throttle(resp.headers_mut(), throttle);
      cookie_action.apply_to(resp.headers_mut(), https);
      return resp;
    }
  };
  {
    let mut pairs = target.query_pairs_mut();
    for (k, v) in &params {
      pairs.append_pair(k, v);
    }
  }

  let mut req_headers = reqwest::header::HeaderMap::new();
  if let Ok(auth_val) = reqwest::header::HeaderValue::from_str(&format!("Client-ID {key}")) {
    req_headers.insert(reqwest::header::AUTHORIZATION, auth_val);
  }
  let policy = SafeFetchPolicy {
    max_redirects: 0,
    timeout: UNSPLASH_TIMEOUT,
    max_response_bytes: UNSPLASH_MAX_RESPONSE_BYTES,
    ..SafeFetchPolicy::default()
  };
  let fetch_req = SafeFetchRequest::get(target.as_str())
    .with_headers(req_headers)
    .with_policy(policy);
  let upstream = match safe_fetch(fetch_req).await {
    Ok(resp) => resp,
    Err(err) => {
      let mut resp = envelope_to_http_response(safe_fetch_error_to_envelope(&err));
      apply_throttle(resp.headers_mut(), throttle);
      cookie_action.apply_to(resp.headers_mut(), https);
      return resp;
    }
  };

  let status = StatusCode::from_u16(upstream.status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
  let mut resp = (status, upstream.body).into_response();
  let h = resp.headers_mut();
  if let Some(ct) = upstream.headers.get(reqwest::header::CONTENT_TYPE)
    && let Ok(v) = HeaderValue::from_bytes(ct.as_bytes())
  {
    h.insert(header::CONTENT_TYPE, v);
  }
  for name in ["x-ratelimit-limit", "x-ratelimit-remaining"] {
    if let Some(val) = upstream.headers.get(name)
      && let Ok(hname) = header::HeaderName::from_bytes(name.as_bytes())
      && let Ok(hval) = HeaderValue::from_bytes(val.as_bytes())
    {
      h.insert(hname, hval);
    }
  }
  apply_throttle(resp.headers_mut(), throttle);
  cookie_action.apply_to(resp.headers_mut(), https);
  resp
}

async fn read_bounded_body(body: Body, max_bytes: usize) -> Result<Vec<u8>, DomainError> {
  let mut stream = body.into_data_stream();
  let mut buf = Vec::new();
  while let Some(chunk) = stream.next().await {
    let chunk = chunk.map_err(|e| DomainError::Validation(format!("bad_request:Failed to read request body: {e}")))?;
    if buf.len().saturating_add(chunk.len()) > max_bytes {
      return Err(DomainError::QuotaExceeded {
        kind: "blob_limit",
        message: "Blob size exceeds the maximum allowed limit.".into(),
      });
    }
    buf.extend_from_slice(&chunk);
  }
  Ok(buf)
}

async fn handle_upload_attachment(
  State(state): State<RouterState>,
  headers: HeaderMap,
  Path((session_id, key)): Path<(String, String)>,
  Query(query): Query<UploadAttachmentQuery>,
  body: Body,
) -> Response {
  let (user_id, cookie_action, throttle) = match authorize_copilot_request(&state, &headers, false).await {
    Ok(ok) => ok,
    Err(resp) => return *resp,
  };
  let https = state.app.config.load().https;
  let bytes = match read_bounded_body(body, MAX_ATTACHMENT_BYTES).await {
    Ok(b) => b,
    Err(err) => {
      let mut resp = domain_error_to_http_response(&err);
      apply_throttle(resp.headers_mut(), throttle);
      cookie_action.apply_to(resp.headers_mut(), https);
      return resp;
    }
  };

  let url = match state
    .app
    .extension
    .copilot_runtime()
    .upload_session_attachment(UploadCopilotAttachmentSpiInput {
      user_id,
      session_id,
      workspace_id: query.workspace_id.unwrap_or_default(),
      key,
      declared_mime_type: query.mime_type,
      file_name: query.file_name,
      bytes,
    })
    .await
  {
    Ok(url) => url,
    Err(err) => {
      let mut resp = domain_error_to_http_response(&err);
      apply_throttle(resp.headers_mut(), throttle);
      cookie_action.apply_to(resp.headers_mut(), https);
      return resp;
    }
  };
  let mut resp = json_utf8_response(StatusCode::OK, AttachmentUrlResponse { url }, true);
  apply_throttle(resp.headers_mut(), throttle);
  cookie_action.apply_to(resp.headers_mut(), https);
  resp
}

async fn handle_download_attachment(
  State(state): State<RouterState>,
  headers: HeaderMap,
  Path((session_id, key)): Path<(String, String)>,
  Query(query): Query<DownloadAttachmentQuery>,
) -> Response {
  let (user_id, cookie_action, throttle) = match authorize_copilot_request(&state, &headers, false).await {
    Ok(ok) => ok,
    Err(resp) => return *resp,
  };
  let https = state.app.config.load().https;
  let obj = match state
    .app
    .extension
    .copilot_runtime()
    .download_session_attachment(DownloadCopilotAttachmentSpiInput {
      user_id,
      session_id,
      workspace_id: query.workspace_id.unwrap_or_default(),
      key,
    })
    .await
  {
    Ok(obj) => obj,
    Err(err) => {
      let mut resp = domain_error_to_http_response(&err);
      apply_throttle(resp.headers_mut(), throttle);
      cookie_action.apply_to(resp.headers_mut(), https);
      return resp;
    }
  };

  let len = obj.bytes.len();
  let mut resp = (StatusCode::OK, obj.bytes).into_response();
  let h = resp.headers_mut();
  h.insert(header::CACHE_CONTROL, HeaderValue::from_static("private, no-store"));
  if let Ok(val) = HeaderValue::from_str(&len.to_string()) {
    h.insert(header::CONTENT_LENGTH, val);
  }
  if !obj.content_type.is_empty()
    && let Ok(val) = HeaderValue::from_str(&obj.content_type)
  {
    h.insert(header::CONTENT_TYPE, val);
  }
  apply_blob_security_headers(h, Some(&obj.content_type), query.file_name.as_deref());
  apply_throttle(resp.headers_mut(), throttle);
  cookie_action.apply_to(resp.headers_mut(), https);
  resp
}
