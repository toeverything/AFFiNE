//! Avatar, source-scoped workspace blob, and legacy blob deprecation REST routes.

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use server_types::DomainError;

use super::{
  apply_blob_security_headers, domain_error_to_http_response, envelope_to_http_response, json_utf8_response,
  resolve_request_principal_with_policy,
};
use crate::RouterState;
use crate::legacy_compat::errors::LegacyErrorEnvelope;

/// Serves locally stored user avatars (`GET /api/avatars/:id`) matching
/// `v0.27.5` `core/user/controller.ts`.
pub(crate) async fn handle_get_avatar(
  State(state): State<RouterState>,
  Path(id): Path<String>,
  headers: HeaderMap,
) -> Response {
  let resolved = match resolve_request_principal_with_policy(&state, &headers, true).await {
    Ok(r) => r,
    Err(err) => return err.into_http_response(),
  };
  let https = state.app.config.load().https;
  if !matches!(state.app.avatars.backend_identity().kind.as_str(), "fs" | "assetpack") {
    let mut resp = domain_error_to_http_response(&DomainError::Forbidden(
      "Only available when avatar storage provider is fs or assetpack.".into(),
    ));
    resolved.cookie_action.apply_to(resp.headers_mut(), https);
    return resp;
  }
  if id.is_empty() || id.contains('/') || id.contains('\\') || id.contains("..") || id.contains('\0') {
    let mut resp = envelope_to_http_response(LegacyErrorEnvelope {
      status: StatusCode::NOT_FOUND.as_u16(),
      code: "Not Found".into(),
      error_type: "RESOURCE_NOT_FOUND".into(),
      name: "USER_AVATAR_NOT_FOUND".into(),
      message: "User avatar not found.".into(),
      data: None,
    });
    resolved.cookie_action.apply_to(resp.headers_mut(), https);
    return resp;
  }
  let obj = match state.app.avatars.get(&id).await {
    Ok(Some(obj)) => obj,
    Ok(None) => {
      let mut resp = envelope_to_http_response(LegacyErrorEnvelope {
        status: StatusCode::NOT_FOUND.as_u16(),
        code: "Not Found".into(),
        error_type: "RESOURCE_NOT_FOUND".into(),
        name: "USER_AVATAR_NOT_FOUND".into(),
        message: "User avatar not found.".into(),
        data: None,
      });
      resolved.cookie_action.apply_to(resp.headers_mut(), https);
      return resp;
    }
    Err(err) => {
      tracing::warn!(avatar_id = %id, error = %err, "failed to load avatar");
      let mut resp = domain_error_to_http_response(&DomainError::Unavailable("avatar storage unavailable".into()));
      resolved.cookie_action.apply_to(resp.headers_mut(), https);
      return resp;
    }
  };

  let (bytes, meta) = obj;
  let mut resp = (StatusCode::OK, bytes).into_response();
  let h = resp.headers_mut();
  if !meta.content_type.is_empty()
    && let Ok(val) = HeaderValue::from_str(&meta.content_type)
  {
    h.insert(header::CONTENT_TYPE, val);
  }
  if let Ok(val) = HeaderValue::from_str(&meta.content_length.to_string()) {
    h.insert(header::CONTENT_LENGTH, val);
  }
  if let Some(dt) = chrono::DateTime::from_timestamp_millis(meta.last_modified_ms)
    && let Ok(val) = HeaderValue::from_str(&dt.to_rfc3339())
  {
    h.insert(header::LAST_MODIFIED, val);
  }
  apply_blob_security_headers(h, Some(&meta.content_type), Some(&id));
  resolved.cookie_action.apply_to(resp.headers_mut(), https);
  resp
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlobSourceQuery {
  pub source_type: Option<String>,
  pub doc_id: Option<String>,
  pub timestamp_ms: Option<String>,
}

fn validate_blob_source_query(query: &BlobSourceQuery) -> Result<(&str, &str, Option<i64>), Box<Response>> {
  let source_type = query.source_type.as_deref().unwrap_or_default();
  let doc_id = query.doc_id.as_deref().unwrap_or_default();
  if source_type == "currentDoc" && !doc_id.is_empty() {
    return Ok((source_type, doc_id, None));
  }
  if source_type == "history" && !doc_id.is_empty() {
    if let Some(ts) = query.timestamp_ms.as_deref().and_then(|raw| raw.parse::<i64>().ok()) {
      return Ok((source_type, doc_id, Some(ts)));
    }
    return Err(Box::new(envelope_to_http_response(LegacyErrorEnvelope {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "Bad Request".into(),
      error_type: "INVALID_INPUT".into(),
      name: "INVALID_HISTORY_TIMESTAMP".into(),
      message: "Invalid history timestamp.".into(),
      data: None,
    })));
  }
  Err(Box::new(envelope_to_http_response(LegacyErrorEnvelope {
    status: StatusCode::BAD_REQUEST.as_u16(),
    code: "Bad Request".into(),
    error_type: "BAD_REQUEST".into(),
    name: "BAD_REQUEST".into(),
    message: "Invalid blob source".into(),
    data: None,
  })))
}

/// Source-scoped blob read (`GET /api/workspaces/:id/blobs/v1/:name`), aligned
/// with `v0.27.5` `core/workspaces/controller.ts:135-167`.
pub(crate) async fn handle_get_blob_v1(
  State(state): State<RouterState>,
  Path((workspace_id, name)): Path<(String, String)>,
  Query(query): Query<BlobSourceQuery>,
  headers: HeaderMap,
) -> Response {
  let resolved = match resolve_request_principal_with_policy(&state, &headers, true).await {
    Ok(r) => r,
    Err(err) => return err.into_http_response(),
  };
  let https = state.app.config.load().https;
  let (source_type, doc_id, timestamp_ms) = match validate_blob_source_query(&query) {
    Ok(v) => v,
    Err(mut resp) => {
      resolved.cookie_action.apply_to(resp.headers_mut(), https);
      return *resp;
    }
  };
  let user_id = resolved.principal.map(|p| p.into_user().id);

  let mut resp = match state
    .app
    .blobs
    .get_source_scoped_blob(
      &workspace_id,
      source_type,
      doc_id,
      timestamp_ms,
      user_id.as_deref(),
      &name,
    )
    .await
  {
    Ok(Some((record, bytes))) => {
      let mut resp = (StatusCode::OK, bytes).into_response();
      let h = resp.headers_mut();
      if let Ok(val) = HeaderValue::from_str(&record.mime) {
        h.insert(header::CONTENT_TYPE, val);
      }
      if let Ok(val) = HeaderValue::from_str(&record.size.to_string()) {
        h.insert(header::CONTENT_LENGTH, val);
      }
      let last_mod = record.created_at.format("%a, %d %b %Y %H:%M:%S GMT").to_string();
      if let Ok(val) = HeaderValue::from_str(&last_mod) {
        h.insert(header::LAST_MODIFIED, val);
      }
      apply_blob_security_headers(h, Some(&record.mime), Some(&name));
      resp
    }
    Ok(None) => envelope_to_http_response(LegacyErrorEnvelope {
      status: StatusCode::NOT_FOUND.as_u16(),
      code: "Not Found".into(),
      error_type: "RESOURCE_NOT_FOUND".into(),
      name: "BLOB_NOT_FOUND".into(),
      message: "Blob not found.".into(),
      data: None,
    }),
    Err(err) => domain_error_to_http_response(&err),
  };
  resolved.cookie_action.apply_to(resp.headers_mut(), https);
  resp
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManifestSourceDto {
  #[serde(rename = "type")]
  source_type: String,
  workspace_id: String,
  doc_id: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  timestamp_ms: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManifestEntryDto {
  key: String,
  size: i64,
  mime: String,
  created_at: String,
  source: ManifestSourceDto,
}

/// Source-scoped doc blob manifest (`GET /api/workspaces/:id/blob-manifest/v1`).
pub(crate) async fn handle_get_blob_manifest_v1(
  State(state): State<RouterState>,
  Path(workspace_id): Path<String>,
  Query(query): Query<BlobSourceQuery>,
  headers: HeaderMap,
) -> Response {
  let resolved = match resolve_request_principal_with_policy(&state, &headers, true).await {
    Ok(r) => r,
    Err(err) => return err.into_http_response(),
  };
  let https = state.app.config.load().https;
  let (source_type, doc_id, timestamp_ms) = match validate_blob_source_query(&query) {
    Ok(v) => v,
    Err(mut resp) => {
      resolved.cookie_action.apply_to(resp.headers_mut(), https);
      return *resp;
    }
  };
  let user_id = resolved.principal.map(|p| p.into_user().id);
  let mut resp = match state
    .app
    .blobs
    .get_doc_blob_manifest(&workspace_id, source_type, doc_id, timestamp_ms, user_id.as_deref())
    .await
  {
    Ok(manifest_entries) => {
      let entries: Vec<ManifestEntryDto> = manifest_entries
        .into_iter()
        .map(|b| ManifestEntryDto {
          key: b.key,
          size: b.size,
          mime: b.mime,
          created_at: b.created_at.to_rfc3339(),
          source: ManifestSourceDto {
            source_type: b.source_type,
            workspace_id: b.workspace_id,
            doc_id: b.doc_id,
            timestamp_ms: b.timestamp_ms,
          },
        })
        .collect();
      json_utf8_response(
        StatusCode::OK,
        serde_json::json!({ "version": 1, "entries": entries }),
        true,
      )
    }
    Err(err) => domain_error_to_http_response(&err),
  };
  resolved.cookie_action.apply_to(resp.headers_mut(), https);
  resp
}

#[derive(Debug, Deserialize)]
pub struct ReadableManifestQuery {
  pub cursor: Option<String>,
  pub limit: Option<usize>,
}

/// Workspace readable blob manifest (`GET /api/workspaces/:id/readable-blob-manifest/v1`).
pub(crate) async fn handle_get_readable_blob_manifest_v1(
  State(state): State<RouterState>,
  Path(workspace_id): Path<String>,
  Query(query): Query<ReadableManifestQuery>,
  headers: HeaderMap,
) -> Response {
  let resolved = match resolve_request_principal_with_policy(&state, &headers, false).await {
    Ok(r) => r,
    Err(err) => return err.into_http_response(),
  };
  let Some(principal) = resolved.principal else {
    return domain_error_to_http_response(&DomainError::Unauthorized("Authentication required".into()));
  };
  let https = state.app.config.load().https;
  let user_id = principal.into_user().id;
  if let Err(err) = state
    .app
    .workspaces
    .require_active_member_role(&workspace_id, &user_id)
    .await
  {
    let mut resp = domain_error_to_http_response(&err);
    resolved.cookie_action.apply_to(resp.headers_mut(), https);
    return resp;
  }
  let limit = query.limit.unwrap_or(25).clamp(1, 100);
  let mut resp = match state
    .app
    .blobs
    .get_readable_blob_manifest(&workspace_id, &user_id, query.cursor.as_deref(), limit)
    .await
  {
    Ok(page) => {
      let entries: Vec<ManifestEntryDto> = page
        .entries
        .into_iter()
        .map(|b| ManifestEntryDto {
          key: b.key,
          size: b.size,
          mime: b.mime,
          created_at: b.created_at.to_rfc3339(),
          source: ManifestSourceDto {
            source_type: b.source_type,
            workspace_id: b.workspace_id,
            doc_id: b.doc_id,
            timestamp_ms: b.timestamp_ms,
          },
        })
        .collect();
      json_utf8_response(
        StatusCode::OK,
        serde_json::json!({ "version": 1, "entries": entries, "nextCursor": page.next_cursor }),
        true,
      )
    }
    Err(err) => domain_error_to_http_response(&err),
  };
  resolved.cookie_action.apply_to(resp.headers_mut(), https);
  resp
}

/// Deprecated legacy blob route (`GET /api/workspaces/:workspace_id/blobs/:name`)
/// aligned 1:1 with `v0.27.5` `core/workspaces/controller.ts:169-178`.
pub(crate) async fn handle_get_legacy_blob(
  State(state): State<RouterState>,
  Path((_workspace_id, _name)): Path<(String, String)>,
  headers: HeaderMap,
) -> Response {
  let resolved = match resolve_request_principal_with_policy(&state, &headers, true).await {
    Ok(r) => r,
    Err(err) => return err.into_http_response(),
  };
  let client_version = headers
    .get("x-affine-version")
    .and_then(|v| v.to_str().ok())
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or("unset_or_invalid");
  let required_version = ">=0.27.0 (source-scoped blob protocol)";
  let mut resp = envelope_to_http_response(LegacyErrorEnvelope {
    status: StatusCode::FORBIDDEN.as_u16(),
    code: "Forbidden".into(),
    error_type: "ACTION_FORBIDDEN".into(),
    name: "UNSUPPORTED_CLIENT_VERSION".into(),
    message: format!("Unsupported client with version [{client_version}], required version is [{required_version}]."),
    data: Some(serde_json::json!({
      "clientVersion": client_version,
      "requiredVersion": required_version,
    })),
  });
  resolved
    .cookie_action
    .apply_to(resp.headers_mut(), state.app.config.load().https);
  resp
}

/// Binary Yjs doc read (`GET /api/workspaces/:workspace_id/docs/:doc_id`),
/// resolving storage alias, enforcing per-doc `Doc.Read` (or `Workspace.Read`
/// for the root doc), merging `snapshots` + `updates`, and setting
/// `publish-mode: edgeless | page` for non-root documents.
pub(crate) async fn handle_get_doc_snapshot(
  State(state): State<RouterState>,
  Path((workspace_id, doc_id)): Path<(String, String)>,
  headers: HeaderMap,
) -> Response {
  let resolved = match resolve_request_principal_with_policy(&state, &headers, true).await {
    Ok(resolved) => resolved,
    Err(err) => return err.into_http_response(),
  };
  let user_id = resolved.principal.map(|p| p.into_user().id);
  let mut resp = match state
    .app
    .workspaces
    .get_doc_binary_for_actor(&workspace_id, user_id.as_deref(), &doc_id)
    .await
  {
    Ok(Some((bytes, publish_mode))) => {
      if doc_id != workspace_id {
        let doc_sharing = state.app.doc_sharing.clone();
        let ws = workspace_id.clone();
        let did = doc_id.clone();
        let is_guest = user_id.is_none();
        tokio::spawn(async move {
          doc_sharing.record_doc_view(&ws, &did, is_guest).await;
        });
      }
      let mut resp = Response::new(axum::body::Body::from(bytes));
      *resp.status_mut() = StatusCode::OK;
      let h = resp.headers_mut();
      h.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/octet-stream"),
      );
      h.insert(header::CACHE_CONTROL, HeaderValue::from_static("private, no-store"));
      if let Some(mode) = publish_mode {
        h.insert("publish-mode", HeaderValue::from_static(mode));
      }
      resp
    }
    Ok(None) => envelope_to_http_response(LegacyErrorEnvelope {
      status: StatusCode::NOT_FOUND.as_u16(),
      code: "Not Found".into(),
      error_type: "RESOURCE_NOT_FOUND".into(),
      name: "DOC_NOT_FOUND".into(),
      message: "Doc not found.".into(),
      data: Some(serde_json::json!({ "spaceId": workspace_id, "docId": doc_id })),
    }),
    Err(err) => domain_error_to_http_response(&err),
  };
  resolved
    .cookie_action
    .apply_to(resp.headers_mut(), state.app.config.load().https);
  resp
}

/// `HEAD /api/workspaces/:workspace_id/public-docs/:doc_id`
pub(crate) async fn handle_head_public_doc(
  State(state): State<RouterState>,
  Path((workspace_id, doc_id)): Path<(String, String)>,
  headers: HeaderMap,
) -> Response {
  let resolved = match resolve_request_principal_with_policy(&state, &headers, true).await {
    Ok(resolved) => resolved,
    Err(err) => return err.into_http_response(),
  };
  let user_id = resolved.principal.map(|p| p.into_user().id);
  let mut resp = match state
    .app
    .doc_sharing
    .head_public_doc(&workspace_id, user_id.as_deref(), &doc_id)
    .await
  {
    Ok((publish_mode, _storage_doc_id)) => {
      let mut resp = StatusCode::OK.into_response();
      resp
        .headers_mut()
        .insert("publish-mode", HeaderValue::from_static(publish_mode));
      resp
    }
    Err(err) => domain_error_to_http_response(&err),
  };
  resolved
    .cookie_action
    .apply_to(resp.headers_mut(), state.app.config.load().https);
  resp
}

/// `GET /api/workspaces/:workspace_id/public-docs/:doc_id`
pub(crate) async fn handle_get_public_doc(
  State(state): State<RouterState>,
  Path((workspace_id, doc_id)): Path<(String, String)>,
  headers: HeaderMap,
) -> Response {
  let resolved = match resolve_request_principal_with_policy(&state, &headers, true).await {
    Ok(resolved) => resolved,
    Err(err) => return err.into_http_response(),
  };
  let user_id = resolved.principal.map(|p| p.into_user().id);
  let mut resp = match state
    .app
    .doc_sharing
    .get_public_doc_binary(&workspace_id, user_id.as_deref(), &doc_id)
    .await
  {
    Ok((bytes, publish_mode, storage_doc_id)) => {
      let doc_sharing = state.app.doc_sharing.clone();
      let ws = workspace_id.clone();
      let is_guest = user_id.is_none();
      tokio::spawn(async move {
        doc_sharing.record_doc_view(&ws, &storage_doc_id, is_guest).await;
      });
      let mut resp = Response::new(axum::body::Body::from(bytes));
      *resp.status_mut() = StatusCode::OK;
      let h = resp.headers_mut();
      h.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/octet-stream"),
      );
      h.insert("publish-mode", HeaderValue::from_static(publish_mode));
      resp
    }
    Err(err) => domain_error_to_http_response(&err),
  };
  resolved
    .cookie_action
    .apply_to(resp.headers_mut(), state.app.config.load().https);
  resp
}

/// `GET /api/workspaces/:workspace_id/public-docs/:doc_id/root-doc`
pub(crate) async fn handle_get_public_root_doc(
  State(state): State<RouterState>,
  Path((workspace_id, doc_id)): Path<(String, String)>,
  headers: HeaderMap,
) -> Response {
  let resolved = match resolve_request_principal_with_policy(&state, &headers, true).await {
    Ok(resolved) => resolved,
    Err(err) => return err.into_http_response(),
  };
  let user_id = resolved.principal.map(|p| p.into_user().id);
  let mut resp = match state
    .app
    .doc_sharing
    .get_public_root_doc(&workspace_id, user_id.as_deref(), &doc_id)
    .await
  {
    Ok(bytes) => {
      let mut resp = Response::new(axum::body::Body::from(bytes));
      *resp.status_mut() = StatusCode::OK;
      resp.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/octet-stream"),
      );
      resp
    }
    Err(err) => domain_error_to_http_response(&err),
  };
  resolved
    .cookie_action
    .apply_to(resp.headers_mut(), state.app.config.load().https);
  resp
}

fn parse_history_timestamp(raw: &str) -> Option<chrono::DateTime<chrono::Utc>> {
  if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(raw) {
    return Some(dt.with_timezone(&chrono::Utc));
  }
  if let Ok(ms) = raw.parse::<i64>() {
    return chrono::DateTime::from_timestamp_millis(ms);
  }
  None
}

/// `GET /api/workspaces/:workspace_id/docs/:guid/histories/:timestamp`
pub(crate) async fn handle_get_doc_history(
  State(state): State<RouterState>,
  Path((workspace_id, guid, timestamp)): Path<(String, String, String)>,
  headers: HeaderMap,
) -> Response {
  let resolved = match resolve_request_principal_with_policy(&state, &headers, false).await {
    Ok(resolved) => resolved,
    Err(err) => return err.into_http_response(),
  };
  let Some(principal) = resolved.principal else {
    let mut resp = domain_error_to_http_response(&DomainError::Unauthorized("Authentication required".into()));
    resolved
      .cookie_action
      .apply_to(resp.headers_mut(), state.app.config.load().https);
    return resp;
  };
  let user_id = principal.into_user().id;
  let mut resp = if let Some(ts) = parse_history_timestamp(&timestamp) {
    match state
      .app
      .histories
      .get_history_binary(&user_id, &workspace_id, &guid, ts)
      .await
    {
      Ok(Some(bytes)) => {
        let mut resp = Response::new(axum::body::Body::from(bytes));
        *resp.status_mut() = StatusCode::OK;
        let h = resp.headers_mut();
        h.insert(
          header::CONTENT_TYPE,
          HeaderValue::from_static("application/octet-stream"),
        );
        h.insert(header::CACHE_CONTROL, HeaderValue::from_static("private, no-store"));
        resp
      }
      Ok(None) => envelope_to_http_response(LegacyErrorEnvelope {
        status: StatusCode::NOT_FOUND.as_u16(),
        code: "Not Found".into(),
        error_type: "RESOURCE_NOT_FOUND".into(),
        name: "DOC_HISTORY_NOT_FOUND".into(),
        message: format!(
          "History of {guid} at {} under Space {workspace_id}.",
          ts.timestamp_millis()
        ),
        data: Some(serde_json::json!({
          "spaceId": workspace_id,
          "docId": guid,
          "timestamp": ts.timestamp_millis(),
        })),
      }),
      Err(err) => domain_error_to_http_response(&err),
    }
  } else {
    envelope_to_http_response(LegacyErrorEnvelope {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "Bad Request".into(),
      error_type: "INVALID_INPUT".into(),
      name: "INVALID_HISTORY_TIMESTAMP".into(),
      message: "Invalid history timestamp.".into(),
      data: Some(serde_json::json!({ "timestamp": timestamp })),
    })
  };
  resolved
    .cookie_action
    .apply_to(resp.headers_mut(), state.app.config.load().https);
  resp
}

/// `GET /api/workspaces/:workspace_id/docs/:doc_id/comment-attachments/:key`
pub(crate) async fn handle_get_comment_attachment(
  State(state): State<RouterState>,
  Path((workspace_id, doc_id, key)): Path<(String, String, String)>,
  headers: HeaderMap,
) -> Response {
  let resolved = match resolve_request_principal_with_policy(&state, &headers, false).await {
    Ok(resolved) => resolved,
    Err(err) => return err.into_http_response(),
  };
  let https = state.app.config.load().https;
  let Some(principal) = resolved.principal else {
    let mut resp = domain_error_to_http_response(&DomainError::Unauthorized("Authentication required".into()));
    resolved.cookie_action.apply_to(resp.headers_mut(), https);
    return resp;
  };
  let user_id = principal.into_user().id;
  let meta = match state
    .app
    .comments
    .get_comment_attachment_meta(&user_id, &workspace_id, &doc_id, &key)
    .await
  {
    Ok(Some(m)) => m,
    Ok(None) => {
      let mut resp = envelope_to_http_response(LegacyErrorEnvelope {
        status: StatusCode::NOT_FOUND.as_u16(),
        code: "Not Found".into(),
        error_type: "RESOURCE_NOT_FOUND".into(),
        name: "COMMENT_ATTACHMENT_NOT_FOUND".into(),
        message: "Comment attachment not found.".into(),
        data: None,
      });
      resolved.cookie_action.apply_to(resp.headers_mut(), https);
      return resp;
    }
    Err(err) => {
      let mut resp = domain_error_to_http_response(&err);
      resolved.cookie_action.apply_to(resp.headers_mut(), https);
      return resp;
    }
  };
  let loaded = load_comment_attachment(&state.app, &meta.workspace_id, &meta.doc_id, &meta.key).await;
  let (bytes, obj_meta) = match loaded {
    Ok(Some(v)) => v,
    Ok(None) => {
      let mut resp = envelope_to_http_response(LegacyErrorEnvelope {
        status: StatusCode::NOT_FOUND.as_u16(),
        code: "Not Found".into(),
        error_type: "RESOURCE_NOT_FOUND".into(),
        name: "COMMENT_ATTACHMENT_NOT_FOUND".into(),
        message: "Comment attachment not found.".into(),
        data: None,
      });
      resolved.cookie_action.apply_to(resp.headers_mut(), https);
      return resp;
    }
    Err(err) => {
      tracing::warn!(error = %err, "failed to load comment attachment");
      let mut resp = domain_error_to_http_response(&DomainError::Unavailable(
        "comment attachment storage unavailable".into(),
      ));
      resolved.cookie_action.apply_to(resp.headers_mut(), https);
      return resp;
    }
  };
  let mut resp = (StatusCode::OK, bytes).into_response();
  let h = resp.headers_mut();
  let ct = if !meta.mime.is_empty() {
    meta.mime.as_str()
  } else {
    obj_meta.content_type.as_str()
  };
  if let Ok(val) = HeaderValue::from_str(ct) {
    h.insert(header::CONTENT_TYPE, val);
  }
  if let Ok(val) = HeaderValue::from_str(&obj_meta.content_length.to_string()) {
    h.insert(header::CONTENT_LENGTH, val);
  }
  let last_mod = meta.created_at.format("%a, %d %b %Y %H:%M:%S GMT").to_string();
  if let Ok(val) = HeaderValue::from_str(&last_mod) {
    h.insert(header::LAST_MODIFIED, val);
  }
  apply_blob_security_headers(h, Some(ct), Some(&meta.name));
  resolved.cookie_action.apply_to(resp.headers_mut(), https);
  resp
}

// compat(data): comment-attachment-legacy-bucket-fallback -- falls back to legacy comment-attachments bucket when shared blobs key is absent
async fn load_comment_attachment(
  app: &crate::AppState,
  workspace_id: &str,
  doc_id: &str,
  key: &str,
) -> Result<Option<(Vec<u8>, server_blob::ObjectMetadata)>, server_blob::StorageError> {
  let shared_key = format!("comment-attachments/{workspace_id}/{doc_id}/{key}");
  match app.blobs.storage().get(&shared_key).await? {
    Some(found) => Ok(Some(found)),
    None => {
      app
        .comment_attachments
        .get(&format!("{workspace_id}/{doc_id}/{key}"))
        .await
    }
  }
}
