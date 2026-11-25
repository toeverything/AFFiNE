//! Frozen `v0.27.5` REST (`/api/auth/session*`) and GraphQL (`/graphql`) request/response codecs.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    error::{StoreError, StoreResult},
    sync::DEFAULT_CLIENT_VERSION,
};

/// Header carrying the client protocol version (`x-affine-version`).
pub const HEADER_AFFINE_VERSION: &str = "x-affine-version";

/// Header distinguishing `web` (same-origin cookie/CSRF) vs `native` (Bearer token) clients.
pub const HEADER_CLIENT_KIND: &str = "x-affine-client-kind";

/// Header carrying the refresh retry counter on `POST /api/auth/session/refresh`.
pub const HEADER_REFRESH_ATTEMPT: &str = "x-affine-refresh-attempt";

/// Client kind wire value for `x-affine-client-kind`.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ApiClientKind {
    Web,
    Native,
}

impl ApiClientKind {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Web => "web",
            Self::Native => "native",
        }
    }
}

/// HTTP method for transport-agnostic API requests.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ApiHttpMethod {
    Get,
    Post,
    Delete,
}

/// Transport-agnostic HTTP request emitted by frozen REST and GraphQL codecs.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApiHttpRequest {
    pub method: ApiHttpMethod,
    pub path: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<Vec<u8>>,
}

/// Common request context for building frozen AFFiNE server API calls.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApiRequestContext {
    pub client_kind: ApiClientKind,
    pub client_version: String,
    pub bearer_token: Option<String>,
}

impl ApiRequestContext {
    pub fn web() -> Self {
        Self {
            client_kind: ApiClientKind::Web,
            client_version: DEFAULT_CLIENT_VERSION.to_string(),
            bearer_token: None,
        }
    }

    pub fn native(bearer_token: Option<String>) -> Self {
        Self {
            client_kind: ApiClientKind::Native,
            client_version: DEFAULT_CLIENT_VERSION.to_string(),
            bearer_token,
        }
    }

    fn base_headers(&self, json_body: bool) -> Vec<(String, String)> {
        let mut headers = vec![
            (
                HEADER_AFFINE_VERSION.to_string(),
                self.client_version.clone(),
            ),
            (
                HEADER_CLIENT_KIND.to_string(),
                self.client_kind.as_str().to_string(),
            ),
            ("cache-control".to_string(), "no-store".to_string()),
        ];
        if json_body {
            headers.push(("content-type".to_string(), "application/json".to_string()));
        }
        if self.client_kind == ApiClientKind::Native
            && let Some(ref token) = self.bearer_token
        {
            headers.push(("authorization".to_string(), format!("Bearer {token}")));
        }
        headers
    }
}

/// User summary returned by `GET /api/auth/session`.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSessionUser {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

/// Response body of `GET /api/auth/session`.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSessionResponse {
    pub user: Option<AuthSessionUser>,
}

/// Request body of `POST /api/auth/session/exchange`.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSessionExchangeRequest {
    pub code: String,
    pub installation_id: String,
    pub platform: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_name: Option<String>,
}

/// Request body of `POST /api/auth/session/refresh` and `POST /api/auth/session/revoke`.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthRefreshTokenRequest {
    pub refresh_token: String,
}

/// Nested session metadata returned by `/api/auth/session/{exchange,refresh}` (`AuthPlugin.swift`).
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSessionMeta {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub absolute_expires_at: Option<String>,
}

/// Token pair response returned by `/api/auth/session/exchange` and `/api/auth/session/refresh`.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthTokenPairResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_type: Option<String>,
    pub access_token: String,
    pub refresh_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_in: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_expires_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session: Option<AuthSessionMeta>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

impl AuthTokenPairResponse {
    /// Extract session ID preferring frozen nested `session.id`, falling back to legacy `sessionId`.
    pub fn resolved_session_id(&self) -> Option<&str> {
        self.session
            .as_ref()
            .map(|s| s.id.as_str())
            .or(self.session_id.as_deref())
    }

    /// Extract `session.absoluteExpiresAt` if present.
    pub fn absolute_expires_at(&self) -> Option<&str> {
        self.session
            .as_ref()
            .and_then(|s| s.absolute_expires_at.as_deref())
    }
}

/// Build `GET /api/auth/session`.
pub fn build_get_auth_session_request(ctx: &ApiRequestContext) -> ApiHttpRequest {
    ApiHttpRequest {
        method: ApiHttpMethod::Get,
        path: "/api/auth/session".to_string(),
        headers: ctx.base_headers(false),
        body: None,
    }
}

/// Decode `GET /api/auth/session` response JSON.
pub fn decode_auth_session_response(body: &[u8]) -> StoreResult<AuthSessionResponse> {
    Ok(serde_json::from_slice(body)?)
}

/// Build `POST /api/auth/session/exchange` (native clients only).
pub fn build_auth_session_exchange_request(
    ctx: &ApiRequestContext,
    payload: &AuthSessionExchangeRequest,
) -> StoreResult<ApiHttpRequest> {
    if ctx.client_kind != ApiClientKind::Native {
        return Err(StoreError::InvalidProtocol(
            "POST /api/auth/session/exchange is restricted to native clients".into(),
        ));
    }
    Ok(ApiHttpRequest {
        method: ApiHttpMethod::Post,
        path: "/api/auth/session/exchange".to_string(),
        headers: ctx.base_headers(true),
        body: Some(serde_json::to_vec(payload)?),
    })
}

/// Validate a lowercase canonical UUID string (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
pub fn is_valid_lowercase_uuid(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    for (idx, &b) in bytes.iter().enumerate() {
        if matches!(idx, 8 | 13 | 18 | 23) {
            if b != b'-' {
                return false;
            }
        } else if !matches!(b, b'0'..=b'9' | b'a'..=b'f') {
            return false;
        }
    }
    true
}

/// Build `POST /api/auth/session/refresh` (native clients only).
///
/// `attempt_id`, when provided, is sent as `x-affine-refresh-attempt` and MUST be a valid
/// lowercase UUID idempotency key (matching `AuthPlugin.swift` and `rest-routes.json`).
pub fn build_auth_session_refresh_request(
    ctx: &ApiRequestContext,
    refresh_token: &str,
    attempt_id: Option<&str>,
) -> StoreResult<ApiHttpRequest> {
    if ctx.client_kind != ApiClientKind::Native {
        return Err(StoreError::InvalidProtocol(
            "POST /api/auth/session/refresh is restricted to native clients".into(),
        ));
    }
    let mut headers = ctx.base_headers(true);
    if let Some(id) = attempt_id {
        if !is_valid_lowercase_uuid(id) {
            return Err(StoreError::InvalidProtocol(format!(
                "x-affine-refresh-attempt must be a lowercase UUID, got `{id}`"
            )));
        }
        headers.push((HEADER_REFRESH_ATTEMPT.to_string(), id.to_string()));
    }
    let payload = AuthRefreshTokenRequest {
        refresh_token: refresh_token.to_string(),
    };
    Ok(ApiHttpRequest {
        method: ApiHttpMethod::Post,
        path: "/api/auth/session/refresh".to_string(),
        headers,
        body: Some(serde_json::to_vec(&payload)?),
    })
}

/// Build `POST /api/auth/session/revoke` (native clients only).
pub fn build_auth_session_revoke_request(
    ctx: &ApiRequestContext,
    refresh_token: &str,
) -> StoreResult<ApiHttpRequest> {
    if ctx.client_kind != ApiClientKind::Native {
        return Err(StoreError::InvalidProtocol(
            "POST /api/auth/session/revoke is restricted to native clients".into(),
        ));
    }
    let payload = AuthRefreshTokenRequest {
        refresh_token: refresh_token.to_string(),
    };
    Ok(ApiHttpRequest {
        method: ApiHttpMethod::Post,
        path: "/api/auth/session/revoke".to_string(),
        headers: ctx.base_headers(true),
        body: Some(serde_json::to_vec(&payload)?),
    })
}

/// Decode token pair JSON from `/api/auth/session/exchange` or `/api/auth/session/refresh`.
pub fn decode_auth_token_pair_response(body: &[u8]) -> StoreResult<AuthTokenPairResponse> {
    Ok(serde_json::from_slice(body)?)
}

/// GraphQL request envelope (`POST /graphql`).
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphqlRequest {
    pub operation_name: String,
    pub query: String,
    pub variables: Value,
}

/// GraphQL error entry inside a `POST /graphql` response.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct GraphqlError {
    pub message: String,
    #[serde(default)]
    pub extensions: Option<Value>,
}

fn none_default<T>() -> Option<T> {
    None
}

/// Generic GraphQL response envelope.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct GraphqlResponse<T> {
    #[serde(default = "none_default")]
    pub data: Option<T>,
    #[serde(default)]
    pub errors: Vec<GraphqlError>,
}

/// Build a `POST /graphql` HTTP request.
pub fn build_graphql_request(
    ctx: &ApiRequestContext,
    operation_name: impl Into<String>,
    query: impl Into<String>,
    variables: Value,
) -> StoreResult<ApiHttpRequest> {
    let envelope = GraphqlRequest {
        operation_name: operation_name.into(),
        query: query.into(),
        variables,
    };
    Ok(ApiHttpRequest {
        method: ApiHttpMethod::Post,
        path: "/graphql".to_string(),
        headers: ctx.base_headers(true),
        body: Some(serde_json::to_vec(&envelope)?),
    })
}

/// Decode a `POST /graphql` response, surfacing GraphQL-level errors as `StoreError::InvalidProtocol`.
pub fn decode_graphql_response<T: for<'de> Deserialize<'de>>(body: &[u8]) -> StoreResult<T> {
    let parsed: GraphqlResponse<T> = serde_json::from_slice(body)?;
    if let Some(first_err) = parsed.errors.first() {
        return Err(StoreError::InvalidProtocol(first_err.message.clone()));
    }
    parsed
        .data
        .ok_or_else(|| StoreError::InvalidProtocol("GraphQL response missing `data`".into()))
}

/// Build the frozen `createBlobUpload` GraphQL mutation request (`blob-upload-create.gql`).
pub fn build_create_blob_upload_request(
    ctx: &ApiRequestContext,
    workspace_id: &str,
    key: &str,
    size: u64,
    mime: &str,
) -> StoreResult<ApiHttpRequest> {
    const QUERY: &str = "mutation createBlobUpload($workspaceId: String!, $key: String!, $size: Int!, $mime: String!) { createBlobUpload(workspaceId: $workspaceId, key: $key, size: $size, mime: $mime) { method blobKey alreadyUploaded uploadUrl headers expiresAt uploadId partSize uploadedParts { partNumber etag } } }";
    build_graphql_request(
        ctx,
        "createBlobUpload",
        QUERY,
        json!({
            "workspaceId": workspace_id,
            "key": key,
            "size": size,
            "mime": mime,
        }),
    )
}

/// Build the frozen `completeBlobUpload` GraphQL mutation request.
pub fn build_complete_blob_upload_request(
    ctx: &ApiRequestContext,
    workspace_id: &str,
    key: &str,
    upload_id: Option<&str>,
    parts: Option<&[(u32, String)]>,
) -> StoreResult<ApiHttpRequest> {
    const QUERY: &str = "mutation completeBlobUpload($workspaceId: String!, $key: String!, $uploadId: String, $parts: [BlobUploadPartInput!]) { completeBlobUpload(workspaceId: $workspaceId, key: $key, uploadId: $uploadId, parts: $parts) }";
    let parts_val = parts.map(|items| {
        items
            .iter()
            .map(|(part_number, etag)| json!({ "partNumber": part_number, "etag": etag }))
            .collect::<Vec<_>>()
    });
    build_graphql_request(
        ctx,
        "completeBlobUpload",
        QUERY,
        json!({
            "workspaceId": workspace_id,
            "key": key,
            "uploadId": upload_id,
            "parts": parts_val,
        }),
    )
}

/// Build the frozen `deleteBlob` GraphQL mutation request.
pub fn build_delete_blob_request(
    ctx: &ApiRequestContext,
    workspace_id: &str,
    key: &str,
    permanently: bool,
) -> StoreResult<ApiHttpRequest> {
    const QUERY: &str = "mutation deleteBlob($workspaceId: String!, $key: String!, $permanently: Boolean) { deleteBlob(workspaceId: $workspaceId, key: $key, permanently: $permanently) }";
    build_graphql_request(
        ctx,
        "deleteBlob",
        QUERY,
        json!({
            "workspaceId": workspace_id,
            "key": key,
            "permanently": permanently,
        }),
    )
}

/// Build the frozen `listBlobs` GraphQL query request (`blob-list.gql`).
pub fn build_list_blobs_request(
    ctx: &ApiRequestContext,
    workspace_id: &str,
    first: u32,
    after: Option<&str>,
) -> StoreResult<ApiHttpRequest> {
    const QUERY: &str = "query listBlobs($workspaceId: String!, $first: Int!, $after: String) { workspace(id: $workspaceId) { blobs(first: $first, after: $after) { key size mime createdAt } } }";
    build_graphql_request(
        ctx,
        "listBlobs",
        QUERY,
        json!({
            "workspaceId": workspace_id,
            "first": first,
            "after": after,
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_session_and_blob_graphql_codecs_enforce_client_kind_and_roundtrip() {
        let web = ApiRequestContext::web();
        let get_session = build_get_auth_session_request(&web);
        assert_eq!(get_session.method, ApiHttpMethod::Get);
        assert_eq!(get_session.path, "/api/auth/session");
        assert!(
            get_session
                .headers
                .contains(&(HEADER_CLIENT_KIND.into(), "web".into()))
        );
        assert!(build_auth_session_revoke_request(&web, "rt-1").is_err());

        let native = ApiRequestContext::native(Some("jwt-abc".into()));
        let exchange = build_auth_session_exchange_request(
            &native,
            &AuthSessionExchangeRequest {
                code: "code-1".into(),
                installation_id: "inst-1".into(),
                platform: "ios".into(),
                device_name: Some("iPhone".into()),
            },
        )
        .unwrap();
        assert_eq!(exchange.path, "/api/auth/session/exchange");
        assert!(
            exchange
                .headers
                .contains(&("authorization".into(), "Bearer jwt-abc".into()))
        );

        let attempt_uuid = "550e8400-e29b-41d4-a716-446655440000";
        let refresh =
            build_auth_session_refresh_request(&native, "rt-1", Some(attempt_uuid)).unwrap();
        assert!(
            refresh
                .headers
                .contains(&(HEADER_REFRESH_ATTEMPT.into(), attempt_uuid.into()))
        );
        // Non-UUID attempt IDs (such as numeric counters or uppercase UUIDs) MUST be rejected.
        assert!(build_auth_session_refresh_request(&native, "rt-1", Some("1")).is_err());
        assert!(build_auth_session_refresh_request(&native, "rt-1", Some("2")).is_err());
        assert!(
            build_auth_session_refresh_request(
                &native,
                "rt-1",
                Some("550E8400-E29B-41D4-A716-446655440000")
            )
            .is_err()
        );

        let list_req = build_list_blobs_request(&native, "ws-1", 50, Some("cursor-1")).unwrap();
        let list_body: GraphqlRequest =
            serde_json::from_slice(list_req.body.as_ref().unwrap()).unwrap();
        assert_eq!(list_body.operation_name, "listBlobs");
        assert_eq!(list_body.variables["first"], 50);
        assert_eq!(list_body.variables["after"], "cursor-1");

        let session = decode_auth_session_response(
            br#"{"user":{"id":"u-1","email":"a@b.com","name":"Alice"}}"#,
        )
        .unwrap();
        assert_eq!(session.user.unwrap().id, "u-1");

        let tokens = decode_auth_token_pair_response(
            br#"{"tokenType":"Bearer","accessToken":"at-1","refreshToken":"rt-2","expiresIn":3600,"refreshExpiresAt":"2026-12-01T00:00:00Z","session":{"id":"sess-9","absoluteExpiresAt":"2027-01-01T00:00:00Z"}}"#,
        )
        .unwrap();
        assert_eq!(tokens.token_type.as_deref(), Some("Bearer"));
        assert_eq!(tokens.access_token, "at-1");
        assert_eq!(tokens.refresh_token, "rt-2");
        assert_eq!(tokens.expires_in, Some(3600));
        assert_eq!(
            tokens.refresh_expires_at.as_deref(),
            Some("2026-12-01T00:00:00Z")
        );
        assert_eq!(tokens.resolved_session_id(), Some("sess-9"));
        assert_eq!(tokens.absolute_expires_at(), Some("2027-01-01T00:00:00Z"));

        let gql_req =
            build_create_blob_upload_request(&native, "ws-1", "blob-1", 42, "image/png").unwrap();
        assert_eq!(gql_req.path, "/graphql");
        let parsed_body: GraphqlRequest =
            serde_json::from_slice(gql_req.body.as_ref().unwrap()).unwrap();
        assert_eq!(parsed_body.operation_name, "createBlobUpload");
        assert_eq!(parsed_body.variables["workspaceId"], "ws-1");

        let ok_data: Value = decode_graphql_response(br#"{"data":{"deleteBlob":true}}"#).unwrap();
        assert_eq!(ok_data["deleteBlob"], true);
        assert!(decode_graphql_response::<Value>(br#"{"errors":[{"message":"boom"}]}"#).is_err());
    }
}
