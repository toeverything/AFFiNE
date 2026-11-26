//! `S3BlobStorage` against an in-process path-style S3 endpoint: presigned
//! PUT/GET/HEAD/DELETE URLs, signed PUT headers, 404 as a missing object and
//! error statuses surfaced as failures, plus the S3 and R2 request timeout
//! that `StorageBackendSpec` reads from an app config.

use std::{
  collections::HashMap,
  sync::{Arc, Mutex},
};

use axum::{
  Router,
  body::Bytes,
  extract::{Path, RawQuery, State},
  http::{HeaderMap, Method, StatusCode},
  response::{IntoResponse, Response},
  routing::any,
};
use server_blob::{BlobStorageBackend, S3BlobStorage, S3Config, StorageBackendSpec, checksum_crc32_base64};

/// Body, content type and CRC32 checksum header of a stored object.
type StoredObject = (Vec<u8>, String, String);

#[derive(Default)]
struct FakeS3 {
  objects: Mutex<HashMap<String, StoredObject>>,
  queries: Mutex<Vec<String>>,
}

async fn handle(
  State(s3): State<Arc<FakeS3>>,
  method: Method,
  Path(path): Path<String>,
  RawQuery(query): RawQuery,
  headers: HeaderMap,
  body: Bytes,
) -> Response {
  let query = query.unwrap_or_default();
  s3.queries.lock().unwrap().push(format!("{method} {path} {query}"));
  if !query.contains("X-Amz-Signature=") || !query.contains("X-Amz-Credential=AKID%2F") {
    return StatusCode::FORBIDDEN.into_response();
  }
  if path.ends_with("forbidden") {
    return (
      StatusCode::INTERNAL_SERVER_ERROR,
      "<Error><Code>InternalError</Code></Error>",
    )
      .into_response();
  }
  let mut objects = s3.objects.lock().unwrap();
  match method {
    Method::PUT => {
      let header = |name: &str| headers.get(name).unwrap().to_str().unwrap().to_owned();
      assert_eq!(header("content-length"), body.len().to_string());
      objects.insert(
        path,
        (body.to_vec(), header("content-type"), header("x-amz-checksum-crc32")),
      );
      StatusCode::OK.into_response()
    }
    Method::GET | Method::HEAD => match objects.get(&path) {
      Some((body, content_type, checksum)) => (
        [
          ("content-type", content_type.clone()),
          ("x-amz-checksum-crc32", checksum.clone()),
          ("last-modified", "Wed, 21 Oct 2015 07:28:00 GMT".to_owned()),
        ],
        body.clone(),
      )
        .into_response(),
      None => (StatusCode::NOT_FOUND, "<Error><Code>NoSuchKey</Code></Error>").into_response(),
    },
    Method::DELETE => {
      objects.remove(&path);
      StatusCode::NO_CONTENT.into_response()
    }
    _ => StatusCode::METHOD_NOT_ALLOWED.into_response(),
  }
}

#[tokio::test]
async fn presigned_put_get_head_delete_round_trip_on_path_style_endpoint() {
  let fake = Arc::new(FakeS3::default());
  let app = Router::new()
    .route("/{*path}", any(handle))
    .with_state(Arc::clone(&fake));
  let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
  let addr = listener.local_addr().unwrap();
  tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

  let storage = S3BlobStorage::new(S3Config {
    endpoint: Some(format!("http://{addr}")),
    region: "us-east-1".into(),
    bucket: "affine-blobs".into(),
    access_key_id: "AKID".into(),
    secret_access_key: "secret".into(),
    session_token: None,
    force_path_style: true,
    request_timeout: None,
  })
  .unwrap();

  let key = "ws-1/blob-key";
  assert_eq!(storage.head(key).await.unwrap(), None);
  assert!(storage.get(key).await.unwrap().is_none());

  let written = storage.put(key, b"payload".to_vec(), "image/webp").await.unwrap();
  assert_eq!(written.content_length, 7);
  assert_eq!(
    written.checksum_crc32.as_deref(),
    Some(checksum_crc32_base64(b"payload").as_str())
  );
  assert_eq!(
    fake
      .objects
      .lock()
      .unwrap()
      .get("affine-blobs/ws-1/blob-key")
      .map(|o| o.1.clone()),
    Some("image/webp".to_owned())
  );

  let head = storage.head(key).await.unwrap().expect("object exists");
  assert_eq!(
    (head.content_type.as_str(), head.content_length, head.last_modified_ms),
    ("image/webp", 7, 1_445_412_480_000)
  );
  assert_eq!(head.checksum_crc32, written.checksum_crc32);
  let (body, metadata) = storage.get(key).await.unwrap().expect("object body");
  assert_eq!(
    (body.as_slice(), metadata.content_type.as_str()),
    (&b"payload"[..], "image/webp")
  );

  storage.delete(key).await.unwrap();
  storage.delete(key).await.unwrap();
  assert_eq!(storage.head(key).await.unwrap(), None);

  assert!(storage.put("ws-1/forbidden", b"x".to_vec(), "a/b").await.is_err());
  assert!(storage.get("ws-1/../escape").await.is_err());
  let queries = fake.queries.lock().unwrap();
  assert!(
    queries.iter().all(|q| !q.contains("escape")),
    "invalid keys never reach the endpoint"
  );
  assert!(queries.iter().any(|q| q.starts_with("PUT affine-blobs/ws-1/blob-key ")));
}

/// Signs a request for a closed local port, so every operation fails at the
/// transport; the error text keeps neither the presigned URL nor its
/// credential scope, signature or session token.
fn unreachable_s3() -> S3BlobStorage {
  let port = {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    listener.local_addr().unwrap().port()
  };
  S3BlobStorage::new(S3Config {
    endpoint: Some(format!("http://127.0.0.1:{port}")),
    region: "us-east-1".into(),
    bucket: "affine-blobs".into(),
    access_key_id: "AKIDLEAKCHECK".into(),
    secret_access_key: "secret".into(),
    session_token: Some("SESSIONLEAKCHECK".into()),
    force_path_style: true,
    request_timeout: Some(std::time::Duration::from_secs(5)),
  })
  .unwrap()
}

#[tokio::test]
async fn transport_failures_do_not_leak_presigned_urls() {
  let storage = unreachable_s3();
  let errors = [
    storage.put("ws/key", b"x".to_vec(), "a/b").await.unwrap_err(),
    storage.get("ws/key").await.unwrap_err(),
    storage.head("ws/key").await.unwrap_err(),
    storage.delete("ws/key").await.unwrap_err(),
  ];
  for error in errors {
    let text = format!("{error} {error:?}");
    for secret in [
      "X-Amz-Signature",
      "X-Amz-Credential",
      "X-Amz-Security-Token",
      "AKIDLEAKCHECK",
      "SESSIONLEAKCHECK",
      "127.0.0.1",
    ] {
      assert!(!text.contains(secret), "{secret} leaked: {text}");
    }
  }
}

#[test]
fn app_config_request_timeout_ms_reaches_s3_and_r2_config() {
  let ms_90s = Some(std::time::Duration::from_millis(90_000));
  for (provider, timeout, expected) in [
    ("aws-s3", serde_json::json!(90_000), ms_90s),
    ("cloudflare-r2", serde_json::json!(90_000), ms_90s),
    ("aws-s3", serde_json::Value::Null, None),
    ("cloudflare-r2", serde_json::Value::Null, None),
  ] {
    let raw = serde_json::json!({
      "provider": provider,
      "bucket": "copilot",
      "config": {
        "region": "auto",
        "accountId": "acct",
        "credentials": { "accessKeyId": "ak", "secretAccessKey": "sk" },
        "requestTimeoutMs": timeout,
      },
    });
    let spec = StorageBackendSpec::from_app_config_json_scoped(&raw, "copilot", "copilot")
      .unwrap()
      .unwrap();
    let StorageBackendSpec::S3 { config, .. } = &spec else {
      panic!("{provider} must parse as S3");
    };
    assert_eq!(config.request_timeout, expected, "{provider} {timeout}");
    spec.build().unwrap();
  }
  let bad = serde_json::json!({
    "provider": "aws-s3",
    "config": { "region": "auto", "requestTimeoutMs": "90s" },
  });
  assert!(StorageBackendSpec::from_app_config_json_scoped(&bad, "copilot", "copilot").is_err());
}
