//! Avatar, source-scoped workspace blob, and legacy blob deprecation REST routes.

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use server_types::DomainError;

use super::{
  apply_blob_security_headers, domain_error_to_http_response, envelope_to_http_response, json_utf8_response,
  resolve_request_principal,
};
use crate::RouterState;
use crate::legacy_compat::errors::LegacyErrorEnvelope;

/// Serves locally stored user avatars (`GET /api/avatars/:id`) matching
/// `v0.27.5` `core/user/controller.ts`.
pub(crate) async fn handle_get_avatar(State(state): State<RouterState>, Path(id): Path<String>) -> Response {
  if id.is_empty() || id.contains('/') || id.contains('\\') || id.contains("..") || id.contains('\0') {
    return envelope_to_http_response(LegacyErrorEnvelope {
      status: StatusCode::NOT_FOUND.as_u16(),
      code: "Not Found".into(),
      error_type: "RESOURCE_NOT_FOUND".into(),
      name: "USER_AVATAR_NOT_FOUND".into(),
      message: "User avatar not found.".into(),
      data: None,
    });
  }
  let obj = match state.app.avatars.get(&id).await {
    Ok(Some(obj)) => obj,
    Ok(None) => {
      return envelope_to_http_response(LegacyErrorEnvelope {
        status: StatusCode::NOT_FOUND.as_u16(),
        code: "Not Found".into(),
        error_type: "RESOURCE_NOT_FOUND".into(),
        name: "USER_AVATAR_NOT_FOUND".into(),
        message: "User avatar not found.".into(),
        data: None,
      });
    }
    Err(err) => {
      tracing::warn!(avatar_id = %id, error = %err, "failed to load avatar");
      return domain_error_to_http_response(&DomainError::Unavailable("avatar storage unavailable".into()));
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
  let (source_type, doc_id, timestamp_ms) = match validate_blob_source_query(&query) {
    Ok(v) => v,
    Err(resp) => return *resp,
  };
  let user_id = match resolve_request_principal(&state, &headers).await {
    Ok(principal) => principal.map(|p| p.into_user().id),
    Err(err) => return err.into_http_response(),
  };

  match state
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
  }
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
  let (source_type, doc_id, timestamp_ms) = match validate_blob_source_query(&query) {
    Ok(v) => v,
    Err(resp) => return *resp,
  };
  let user_id = match resolve_request_principal(&state, &headers).await {
    Ok(principal) => principal.map(|p| p.into_user().id),
    Err(err) => return err.into_http_response(),
  };
  let manifest_entries = match state
    .app
    .blobs
    .get_doc_blob_manifest(&workspace_id, source_type, doc_id, timestamp_ms, user_id.as_deref())
    .await
  {
    Ok(entries) => entries,
    Err(err) => return domain_error_to_http_response(&err),
  };
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
  let user_id = match resolve_request_principal(&state, &headers).await {
    Ok(Some(principal)) => principal.into_user().id,
    Ok(None) => return domain_error_to_http_response(&DomainError::Unauthorized("Authentication required".into())),
    Err(err) => return err.into_http_response(),
  };
  if let Err(err) = state
    .app
    .workspaces
    .require_active_member_role(&workspace_id, &user_id)
    .await
  {
    return domain_error_to_http_response(&err);
  }
  let limit = query.limit.unwrap_or(25).clamp(1, 100);
  let page = match state
    .app
    .blobs
    .get_readable_blob_manifest(&workspace_id, &user_id, query.cursor.as_deref(), limit)
    .await
  {
    Ok(p) => p,
    Err(err) => return domain_error_to_http_response(&err),
  };
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

/// Binary Yjs doc read (`GET /api/workspaces/:workspace_id/docs/:doc_id`),
/// resolving storage alias, enforcing per-doc `Doc.Read` (or `Workspace.Read`
/// for the root doc), merging `snapshots` + `updates`, and setting
/// `publish-mode: edgeless | page` for non-root documents.
pub(crate) async fn handle_get_doc_snapshot(
  State(state): State<RouterState>,
  Path((workspace_id, doc_id)): Path<(String, String)>,
  headers: HeaderMap,
) -> Response {
  let user_id = match resolve_request_principal(&state, &headers).await {
    Ok(principal) => principal.map(|p| p.into_user().id),
    Err(err) => return err.into_http_response(),
  };
  match state
    .app
    .workspaces
    .get_doc_binary_for_actor(&workspace_id, user_id.as_deref(), &doc_id)
    .await
  {
    Ok(Some((bytes, publish_mode))) => {
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
  }
}
