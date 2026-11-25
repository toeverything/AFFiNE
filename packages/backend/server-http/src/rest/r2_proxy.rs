//! R2 / local storage upload proxy routes (`PUT /api/storage/upload` and `PUT /api/storage/multipart`).

use std::collections::HashMap;

use axum::Router;
use axum::body::Body;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::put;
use futures_util::StreamExt as _;
use server_types::DomainError;

use crate::RouterState;
use crate::rest::domain_error_to_http_response;

const MAX_PROXY_BODY_BYTES: usize = 100 * 1024 * 1024;
pub(crate) fn router() -> Router<RouterState> {
  Router::new()
    .route("/api/storage/upload", put(handle_proxy_upload))
    .route("/api/storage/multipart", put(handle_proxy_multipart))
    .layer(axum::extract::DefaultBodyLimit::max(MAX_PROXY_BODY_BYTES))
}
fn param<'a>(p: &'a HashMap<String, String>, f: &str) -> Result<&'a str, DomainError> {
  p.get(f)
    .map(String::as_str)
    .filter(|s| !s.is_empty())
    .ok_or_else(|| DomainError::Validation(format!("Missing {f}.")))
}
fn param_i64(p: &HashMap<String, String>, f: &str) -> Result<i64, DomainError> {
  param(p, f)?
    .parse()
    .map_err(|_| DomainError::Validation(format!("Invalid {f}.")))
}
fn bad(m: &str) -> DomainError {
  DomainError::Validation(m.into())
}
async fn read_body_bounded(body: Body, expected_len: usize) -> Result<Vec<u8>, DomainError> {
  let max_allowed = expected_len.min(MAX_PROXY_BODY_BYTES);
  let mut stream = body.into_data_stream();
  let mut out = Vec::with_capacity(max_allowed.min(64 * 1024));
  while let Some(chunk) = stream.next().await {
    let chunk = chunk.map_err(|e| DomainError::Validation(format!("Failed to read upload body: {e}")))?;
    if out.len().saturating_add(chunk.len()) > max_allowed {
      return Err(bad("Content length mismatch"));
    }
    out.extend_from_slice(&chunk);
  }
  if out.len() != expected_len {
    return Err(bad("Content length mismatch"));
  }
  Ok(out)
}
fn parse_len(p: &HashMap<String, String>, h: &HeaderMap, min: i64, req_hdr: bool) -> Result<(i64, usize), DomainError> {
  let qlen = param_i64(p, "contentLength")?;
  let hlen = h
    .get(header::CONTENT_LENGTH)
    .map(|r| {
      r.to_str()
        .ok()
        .and_then(|s| s.trim().parse::<i64>().ok())
        .filter(|&n| n >= 0)
        .ok_or_else(|| bad("Invalid Content-Length header"))
    })
    .transpose()?;
  if qlen < min {
    return Err(bad("Invalid content length"));
  }
  if req_hdr && !hlen.is_some_and(|n| n > 0) {
    return Err(bad("Missing Content-Length header"));
  }
  if hlen.is_some_and(|hl| hl != qlen) {
    return Err(bad("Content length mismatch"));
  }
  let exp = usize::try_from(qlen)
    .ok()
    .filter(|&n| n <= MAX_PROXY_BODY_BYTES)
    .ok_or_else(|| bad("Invalid content length"))?;
  Ok((qlen, exp))
}
async fn handle_proxy_upload(
  State(st): State<RouterState>,
  Query(p): Query<HashMap<String, String>>,
  h: HeaderMap,
  body: Body,
) -> Response {
  let res = async {
    let (ws, key, tok, ct) = (
      param(&p, "workspaceId")?,
      param(&p, "key")?,
      param(&p, "token")?,
      param(&p, "contentType")?,
    );
    let (exp, (len, n)) = (param_i64(&p, "expiresAt")?, parse_len(&p, &h, 0, false)?);
    let v = st
      .app
      .blobs
      .verify_proxy_upload_request(ws, key, ct, len, exp, tok)
      .await?;
    st.app
      .blobs
      .write_proxy_upload_object(v, read_body_bounded(body, n).await?)
      .await
  }
  .await;
  match res {
    Ok(()) => StatusCode::OK.into_response(),
    Err(e) => domain_error_to_http_response(&e),
  }
}
async fn handle_proxy_multipart(
  State(st): State<RouterState>,
  Query(p): Query<HashMap<String, String>>,
  h: HeaderMap,
  body: Body,
) -> Response {
  let res = async {
    let (ws, key, uid, tok) = (
      param(&p, "workspaceId")?,
      param(&p, "key")?,
      param(&p, "uploadId")?,
      param(&p, "token")?,
    );
    let (exp, (len, n)) = (param_i64(&p, "expiresAt")?, parse_len(&p, &h, 1, true)?);
    let part = i32::try_from(param_i64(&p, "partNumber")?)
      .ok()
      .filter(|&x| x >= 1)
      .ok_or_else(|| bad("Invalid part number"))?;
    let ps = st.app.config.load().multipart_part_size;
    let v = st
      .app
      .blobs
      .verify_proxy_multipart_request(ws, key, uid, part, len, exp, tok, ps)
      .await?;
    st.app
      .blobs
      .write_proxy_multipart_part(v, read_body_bounded(body, n).await?)
      .await
  }
  .await;
  match res {
    Ok(etag) => {
      let mut resp = StatusCode::OK.into_response();
      if let Ok(val) = HeaderValue::from_str(&etag) {
        resp.headers_mut().insert(header::ETAG, val);
      }
      resp
    }
    Err(e) => domain_error_to_http_response(&e),
  }
}
