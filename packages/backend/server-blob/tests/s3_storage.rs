//! `S3BlobStorage` against an in-process path-style S3 endpoint: presigned
//! PUT/GET/HEAD/DELETE URLs, signed PUT headers, 404 as a missing object and
//! error statuses surfaced as failures, bounded reads and error bodies, SigV4 and R2 signed
//! download URLs, plus the S3 and R2 request timeout that
//! `StorageBackendSpec` reads from an app config.

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
    presign_expires: None,
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

  for (max_bytes, fits) in [(7, true), (6, false)] {
    let limited = storage.get_limited(key, max_bytes).await;
    assert_eq!(limited.is_ok(), fits, "get_limited({max_bytes})");
  }
  assert!(storage.get_limited("ws-1/missing", 7).await.unwrap().is_none());
  let signed = storage.presign_get(key).await.unwrap().expect("SigV4 download URL");
  assert!(
    signed
      .url
      .starts_with(&format!("http://{addr}/affine-blobs/ws-1/blob-key?"))
  );
  assert!(signed.url.contains("X-Amz-Signature="), "{}", signed.url);

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
    presign_expires: None,
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

#[test]
fn signed_download_urls_keep_the_raw_sign_key_and_the_configured_lifetime() {
  use base64::{Engine as _, engine::general_purpose::STANDARD};
  use hmac::{Hmac, Mac as _};

  let rt = tokio::runtime::Builder::new_current_thread()
    .enable_all()
    .build()
    .unwrap();
  let presign = |raw: serde_json::Value| {
    let spec = StorageBackendSpec::from_app_config_json_scoped(&raw, "copilot", "copilot")
      .unwrap()
      .unwrap();
    rt.block_on(spec.build().unwrap().presign_get("u1/ws1/blob-0"))
      .unwrap()
      .expect("signed download URL")
  };

  for ttl in [300u64, 0] {
    // R2 behind a signing worker: the MAC uses the untrimmed sign key and the
    // same timestamp as the expiry.
    let sign_key = "worker-secret-with-newline\n";
    let signed = presign(serde_json::json!({
      "provider": "cloudflare-r2",
      "bucket": "copilot",
      "config": {
        "accountId": "acct",
        "credentials": { "accessKeyId": "ak", "secretAccessKey": "sk" },
        "usePresignedURL": { "enabled": true, "urlPrefix": "https://cdn.example.test/r2", "signKey": sign_key },
        "presign": { "expiresInSeconds": ttl },
      },
    }));
    let url = url::Url::parse(&signed.url).unwrap();
    assert_eq!(url.path(), "/r2/u1/ws1/blob-0");
    let sign = url
      .query_pairs()
      .find_map(|(k, v)| (k == "sign").then(|| v.into_owned()))
      .expect("sign query");
    let (ts, mac) = sign.split_once('-').expect("timestamp and signature");
    let mut expected = Hmac::<sha2::Sha256>::new_from_slice(sign_key.as_bytes()).unwrap();
    expected.update(format!("{}{ts}", url.path()).as_bytes());
    assert_eq!(mac, STANDARD.encode(expected.finalize().into_bytes()));
    assert_eq!(
      signed.expires_at.timestamp(),
      ts.parse::<i64>().unwrap() + ttl as i64,
      "ttl {ttl}"
    );

    // S3 SigV4 download URLs carry the configured lifetime.
    let signed = presign(serde_json::json!({
      "provider": "aws-s3",
      "bucket": "copilot",
      "config": {
        "region": "us-east-1",
        "endpoint": "http://127.0.0.1:9",
        "forcePathStyle": true,
        "credentials": { "accessKeyId": "ak", "secretAccessKey": "sk" },
        "presign": { "expiresInSeconds": ttl },
      },
    }));
    let expires = url::Url::parse(&signed.url)
      .unwrap()
      .query_pairs()
      .find_map(|(k, v)| (k == "X-Amz-Expires").then(|| v.into_owned()));
    assert_eq!(expires, Some(ttl.to_string()), "{}", signed.url);
  }
}

#[tokio::test]
async fn error_responses_are_read_up_to_a_bounded_prefix() {
  use std::io::{Read as _, Write as _};

  // Streams a chunked HTTP 500 body of 128 KiB and then keeps the stream open,
  // so a client that reads the error body to the end never returns.
  let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
  let addr = listener.local_addr().unwrap();
  let (hold_tx, hold_rx) = std::sync::mpsc::channel::<()>();
  std::thread::spawn(move || {
    let (mut socket, _) = listener.accept().unwrap();
    let mut request = [0u8; 4096];
    assert!(socket.read(&mut request).unwrap() > 0);
    socket
      .write_all(
        b"HTTP/1.1 500 Internal Server Error\r\ncontent-type: text/plain\r\ntransfer-encoding: chunked\r\n\r\n",
      )
      .unwrap();
    let chunk = vec![b'e'; 16 * 1024];
    for _ in 0..8 {
      socket.write_all(format!("{:x}\r\n", chunk.len()).as_bytes()).unwrap();
      socket.write_all(&chunk).unwrap();
      socket.write_all(b"\r\n").unwrap();
    }
    socket.flush().unwrap();
    let _ = hold_rx.recv();
  });

  let storage = S3BlobStorage::new(S3Config {
    endpoint: Some(format!("http://{addr}")),
    region: "us-east-1".into(),
    bucket: "affine-blobs".into(),
    access_key_id: "AKID".into(),
    secret_access_key: "secret".into(),
    session_token: None,
    force_path_style: true,
    request_timeout: None,
    presign_expires: None,
  })
  .unwrap();
  let result = tokio::time::timeout(
    std::time::Duration::from_secs(10),
    storage.get_limited("ws-1/error-key", 1024),
  )
  .await
  .expect("the error body read must stop at its bounded prefix");
  match result {
    Err(server_blob::StorageError::Request { message, .. }) => {
      assert!(message.starts_with("HTTP 500"), "{message}");
      assert!(message.len() < 1024, "the error text keeps a short prefix");
    }
    other => panic!("expected a request error, got {other:?}"),
  }
  drop(hold_tx);
}
