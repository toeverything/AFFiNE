use serde::{Deserialize, Serialize};

use crate::{error::StoreResult, id_converter::IdConverter};

/// Source context required by source-scoped Blob REST endpoints (`v0.27.5`).
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BlobSource {
    #[serde(rename_all = "camelCase")]
    CurrentDoc {
        workspace_id: String,
        doc_id: String,
    },
    #[serde(rename_all = "camelCase")]
    History {
        workspace_id: String,
        doc_id: String,
        timestamp_ms: i64,
    },
}

impl BlobSource {
    pub fn source_type_str(&self) -> &'static str {
        match self {
            Self::CurrentDoc { .. } => "currentDoc",
            Self::History { .. } => "history",
        }
    }

    pub fn doc_id(&self) -> &str {
        match self {
            Self::CurrentDoc { doc_id, .. } | Self::History { doc_id, .. } => doc_id,
        }
    }

    pub fn timestamp_ms(&self) -> Option<i64> {
        match self {
            Self::CurrentDoc { .. } => None,
            Self::History { timestamp_ms, .. } => Some(*timestamp_ms),
        }
    }

    fn with_doc_id(&self, next_doc_id: String) -> Self {
        match self {
            Self::CurrentDoc { workspace_id, .. } => Self::CurrentDoc {
                workspace_id: workspace_id.clone(),
                doc_id: next_doc_id,
            },
            Self::History {
                workspace_id,
                timestamp_ms,
                ..
            } => Self::History {
                workspace_id: workspace_id.clone(),
                doc_id: next_doc_id,
                timestamp_ms: *timestamp_ms,
            },
        }
    }
}

/// HTTP method for transport-agnostic Blob REST requests.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HttpMethod {
    Get,
    Put,
}

/// Transport-agnostic HTTP request built by the source-scoped Blob REST codec.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BlobHttpRequest {
    pub method: HttpMethod,
    pub path_and_query: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<Vec<u8>>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceBlobRecord {
    pub key: String,
    pub mime: String,
    pub size: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    pub source: BlobSource,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlobManifestV1 {
    pub version: u32,
    pub entries: Vec<SourceBlobRecord>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadableBlobManifestV1 {
    pub version: u32,
    pub entries: Vec<SourceBlobRecord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

/// Percent-encode a URI path or query component matching RFC 3986 unreserved characters.
pub fn encode_uri_component(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            out.push(byte as char);
        } else {
            out.push('%');
            out.push(hex_upper(byte >> 4));
            out.push(hex_upper(byte & 0x0f));
        }
    }
    out
}

fn hex_upper(nibble: u8) -> char {
    match nibble {
        0..=9 => (b'0' + nibble) as char,
        10..=15 => (b'A' + (nibble - 10)) as char,
        _ => '0',
    }
}

fn source_query_string(source: &BlobSource, id_converter: &IdConverter) -> String {
    let wire_doc_id = id_converter.new_id_to_old_id(source.doc_id());
    let mut query = format!(
        "sourceType={}&docId={}",
        encode_uri_component(source.source_type_str()),
        encode_uri_component(&wire_doc_id)
    );
    if let Some(ts) = source.timestamp_ms() {
        query.push_str(&format!("&timestampMs={ts}"));
    }
    query
}

fn normalize_manifest_entries(entries: &mut [SourceBlobRecord], id_converter: &IdConverter) {
    for entry in entries {
        let local_doc_id = id_converter.old_id_to_new_id(entry.source.doc_id());
        entry.source = entry.source.with_doc_id(local_doc_id);
    }
}

/// Build `GET /api/workspaces/:id/blobs/v1/:name?sourceType=...&docId=...[&timestampMs=...]`
/// with `source.doc_id()` converted to the server wire ID via `id_converter`.
pub fn build_get_blob_request(
    workspace_id: &str,
    name: &str,
    source: &BlobSource,
    id_converter: &IdConverter,
) -> BlobHttpRequest {
    let path_and_query = format!(
        "/api/workspaces/{}/blobs/v1/{}?{}",
        encode_uri_component(workspace_id),
        encode_uri_component(name),
        source_query_string(source, id_converter)
    );
    BlobHttpRequest {
        method: HttpMethod::Get,
        path_and_query,
        headers: vec![("cache-control".to_string(), "no-store".to_string())],
        body: None,
    }
}

/// Build a direct presigned or multipart part `PUT` upload request using the URL and headers
/// returned by the `createBlobUpload` / `blobUploadPartUrl` GraphQL mutations.
pub fn build_presigned_put_request(
    upload_url: &str,
    headers: &[(String, String)],
    data: Vec<u8>,
) -> BlobHttpRequest {
    BlobHttpRequest {
        method: HttpMethod::Put,
        path_and_query: upload_url.to_string(),
        headers: headers.to_vec(),
        body: Some(data),
    }
}

/// Build `GET /api/workspaces/:id/blob-manifest/v1?sourceType=...&docId=...[&timestampMs=...]`
/// with `source.doc_id()` converted to the server wire ID via `id_converter`.
pub fn build_blob_manifest_request(
    workspace_id: &str,
    source: &BlobSource,
    id_converter: &IdConverter,
) -> BlobHttpRequest {
    let path_and_query = format!(
        "/api/workspaces/{}/blob-manifest/v1?{}",
        encode_uri_component(workspace_id),
        source_query_string(source, id_converter)
    );
    BlobHttpRequest {
        method: HttpMethod::Get,
        path_and_query,
        headers: vec![("cache-control".to_string(), "no-store".to_string())],
        body: None,
    }
}

/// Build `GET /api/workspaces/:id/readable-blob-manifest/v1?limit=...[&cursor=...]`.
pub fn build_readable_blob_manifest_request(
    workspace_id: &str,
    cursor: Option<&str>,
    limit: Option<u32>,
) -> BlobHttpRequest {
    let limit = limit.unwrap_or(100);
    let mut query = format!("limit={limit}");
    if let Some(c) = cursor {
        query.push_str(&format!("&cursor={}", encode_uri_component(c)));
    }
    let path_and_query = format!(
        "/api/workspaces/{}/readable-blob-manifest/v1?{query}",
        encode_uri_component(workspace_id)
    );
    BlobHttpRequest {
        method: HttpMethod::Get,
        path_and_query,
        headers: vec![("cache-control".to_string(), "no-store".to_string())],
        body: None,
    }
}

/// Decode `GET /api/workspaces/:id/blob-manifest/v1` and normalize wire `docId`s to local IDs.
pub fn decode_blob_manifest_v1(
    body: &[u8],
    id_converter: &IdConverter,
) -> StoreResult<BlobManifestV1> {
    let mut manifest: BlobManifestV1 = serde_json::from_slice(body)?;
    normalize_manifest_entries(&mut manifest.entries, id_converter);
    Ok(manifest)
}

/// Decode `GET /api/workspaces/:id/readable-blob-manifest/v1` and normalize wire `docId`s to local IDs.
pub fn decode_readable_blob_manifest_v1(
    body: &[u8],
    id_converter: &IdConverter,
) -> StoreResult<ReadableBlobManifestV1> {
    let mut manifest: ReadableBlobManifestV1 = serde_json::from_slice(body)?;
    normalize_manifest_entries(&mut manifest.entries, id_converter);
    Ok(manifest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_scoped_blob_requests_and_manifest_codecs_convert_ids_and_match_v0275() {
        let mut converter = IdConverter::new("ws-1");
        converter.register_page_mapping("page-local", "legacy-guid-1");

        let current = BlobSource::CurrentDoc {
            workspace_id: "ws-1".into(),
            doc_id: "page-local".into(),
        };
        let get_req = build_get_blob_request("ws-1", "img+1.png", &current, &converter);
        assert_eq!(get_req.method, HttpMethod::Get);
        assert_eq!(
            get_req.path_and_query,
            "/api/workspaces/ws-1/blobs/v1/img%2B1.png?sourceType=currentDoc&docId=legacy-guid-1"
        );

        let history = BlobSource::History {
            workspace_id: "ws-1".into(),
            doc_id: "page-local".into(),
            timestamp_ms: 1_700_000_000_000,
        };
        let manifest_req = build_blob_manifest_request("ws-1", &history, &converter);
        assert_eq!(
            manifest_req.path_and_query,
            "/api/workspaces/ws-1/blob-manifest/v1?sourceType=history&docId=legacy-guid-1&timestampMs=1700000000000"
        );

        let readable_req = build_readable_blob_manifest_request("ws-1", Some("cur=1"), Some(50));
        assert_eq!(
            readable_req.path_and_query,
            "/api/workspaces/ws-1/readable-blob-manifest/v1?limit=50&cursor=cur%3D1"
        );

        let put_req = build_presigned_put_request(
            "https://s3.example.com/bucket/blob-9?sig=abc",
            &[("content-type".into(), "image/png".into())],
            vec![1, 2, 3],
        );
        assert_eq!(put_req.method, HttpMethod::Put);
        assert_eq!(put_req.body, Some(vec![1, 2, 3]));

        let manifest_json = br#"{"version":1,"entries":[{"key":"b1","mime":"image/png","size":12,"source":{"type":"currentDoc","workspaceId":"ws-1","docId":"legacy-guid-1"}}],"nextCursor":"next-1"}"#;
        let parsed = decode_readable_blob_manifest_v1(manifest_json, &converter).unwrap();
        assert_eq!(parsed.version, 1);
        assert_eq!(parsed.entries.len(), 1);
        assert_eq!(parsed.entries[0].source.doc_id(), "page-local");
        assert_eq!(parsed.next_cursor.as_deref(), Some("next-1"));

        let single_json = br#"{"version":1,"entries":[{"key":"b2","mime":"text/plain","size":4,"source":{"type":"history","workspaceId":"ws-1","docId":"db$ws-1$folders","timestampMs":42}}]}"#;
        let single = decode_blob_manifest_v1(single_json, &converter).unwrap();
        assert_eq!(single.entries[0].source.doc_id(), "db$folders");
    }
}
