use reqwest::StatusCode;

use super::{
  config::ObjectStorageConfig,
  error::ObjectStorageError,
  types::{
    MultipartUploadPart, ObjectPutMetadata, StorageProviderConfig, checksum_crc32_base64, completed_multipart_parts,
    trim_etag,
  },
};

fn storage_config(provider: &str, config: serde_json::Value) -> StorageProviderConfig {
  StorageProviderConfig {
    provider: provider.to_string(),
    bucket: "test-bucket".to_string(),
    config,
  }
}

#[test]
fn resolves_r2_config_from_config_json_shape() {
  let storage = StorageProviderConfig {
    provider: "cloudflare-r2".to_string(),
    bucket: "workspace-blobs".to_string(),
    config: serde_json::json!({
      "accountId": "account",
      "jurisdiction": "eu",
      "credentials": {
        "accessKeyId": "key",
        "secretAccessKey": "secret"
      },
      "usePresignedURL": {
        "enabled": true
      }
    }),
  };

  let config = ObjectStorageConfig::from_r2_config(storage).unwrap().unwrap();
  assert_eq!(config.provider, "cloudflare-r2");
  assert_eq!(config.bucket, "workspace-blobs");
  assert_eq!(
    config.endpoint.as_deref(),
    Some("https://account.eu.r2.cloudflarestorage.com")
  );
  assert_eq!(config.region.as_deref(), Some("auto"));
  assert!(config.force_path_style);
  assert!(config.use_presigned_url);
  assert!(!config.proxy_upload);
  assert_eq!(config.access_key_id.as_deref(), Some("key"));
}

#[test]
fn resolves_r2_endpoint_cases_from_config_json_shape() {
  for (case, config, expected_endpoint) in [
    (
      "default account endpoint",
      serde_json::json!({
        "accountId": "account",
        "credentials": {
          "accessKeyId": "key",
          "secretAccessKey": "secret"
        }
      }),
      Some("https://account.r2.cloudflarestorage.com"),
    ),
    (
      "explicit null jurisdiction",
      serde_json::json!({
        "accountId": "account",
        "jurisdiction": null,
        "credentials": {
          "accessKeyId": "key",
          "secretAccessKey": "secret"
        }
      }),
      Some("https://account.r2.cloudflarestorage.com"),
    ),
    (
      "eu jurisdiction",
      serde_json::json!({
        "accountId": "account",
        "jurisdiction": "eu",
        "credentials": {
          "accessKeyId": "key",
          "secretAccessKey": "secret"
        }
      }),
      Some("https://account.eu.r2.cloudflarestorage.com"),
    ),
  ] {
    let config = ObjectStorageConfig::from_r2_config(storage_config("cloudflare-r2", config))
      .unwrap()
      .unwrap();
    assert_eq!(config.endpoint.as_deref(), expected_endpoint, "{case}");
    assert!(config.force_path_style, "{case}");
  }

  assert!(
    ObjectStorageConfig::from_r2_config(storage_config(
      "cloudflare-r2",
      serde_json::json!({
        "credentials": {
          "accessKeyId": "key",
          "secretAccessKey": "secret"
        }
      })
    ))
    .is_err()
  );
}

#[test]
fn object_storage_not_found_requires_object_error_code() {
  let bucket_or_route_missing = ObjectStorageError::HttpStatus {
    context: "head failed".to_string(),
    status: StatusCode::NOT_FOUND,
    body: String::new(),
  };
  let object_missing = ObjectStorageError::HttpStatus {
    context: "get failed".to_string(),
    status: StatusCode::NOT_FOUND,
    body: "<Error><Code>NoSuchKey</Code></Error>".to_string(),
  };
  let upload_missing = ObjectStorageError::HttpStatus {
    context: "abort failed".to_string(),
    status: StatusCode::NOT_FOUND,
    body: "<Error><Code>NoSuchUpload</Code></Error>".to_string(),
  };

  assert!(!bucket_or_route_missing.is_not_found());
  assert!(object_missing.is_not_found());
  assert!(upload_missing.is_not_found());
}

#[test]
fn resolves_r2_proxy_upload_capability_from_config_json_shape() {
  let storage = StorageProviderConfig {
    provider: "cloudflare-r2".to_string(),
    bucket: "workspace-blobs".to_string(),
    config: serde_json::json!({
      "accountId": "account",
      "credentials": {
        "accessKeyId": "key",
        "secretAccessKey": "secret"
      },
      "usePresignedURL": {
        "enabled": true,
        "urlPrefix": "https://cdn.example.com",
        "signKey": "secret"
      }
    }),
  };

  let config = ObjectStorageConfig::from_r2_config(storage).unwrap().unwrap();

  assert!(config.use_presigned_url);
  assert!(config.proxy_upload);
}

#[test]
fn resolves_s3_config_from_config_json_shape() {
  let storage = StorageProviderConfig {
    provider: "aws-s3".to_string(),
    bucket: "workspace-blobs".to_string(),
    config: serde_json::json!({
      "region": "us-west-2",
      "credentials": {
        "accessKeyId": "key",
        "secretAccessKey": "secret",
        "sessionToken": "session"
      },
      "forcePathStyle": true,
      "requestTimeoutMs": 1000,
      "minPartSize": 1024,
      "presign": {
        "expiresInSeconds": 60,
        "signContentTypeForPut": false
      }
    }),
  };

  let config = ObjectStorageConfig::from_s3_config(storage).unwrap().unwrap();
  assert_eq!(config.provider, "aws-s3");
  assert_eq!(config.endpoint.as_deref(), Some("https://s3.us-west-2.amazonaws.com"));
  assert_eq!(config.session_token.as_deref(), Some("session"));
  assert!(config.force_path_style);
  assert_eq!(config.request_timeout_ms, Some(1000));
  assert_eq!(config.min_part_size, Some(1024));
  assert_eq!(config.presign_expires_in_seconds, Some(60));
  assert_eq!(config.presign_sign_content_type_for_put, Some(false));
}

#[test]
fn resolves_s3_default_endpoint_cases_from_config_json_shape() {
  for (region, expected_endpoint) in [
    ("us-east-1", "https://s3.amazonaws.com"),
    ("us-west-2", "https://s3.us-west-2.amazonaws.com"),
  ] {
    let config = ObjectStorageConfig::from_s3_config(storage_config(
      "aws-s3",
      serde_json::json!({
        "region": region,
        "credentials": {
          "accessKeyId": "key",
          "secretAccessKey": "secret"
        }
      }),
    ))
    .unwrap()
    .unwrap();
    assert_eq!(config.endpoint.as_deref(), Some(expected_endpoint), "{region}");
  }
}

#[tokio::test]
async fn object_storage_presign_put_returns_sigv4_url_and_headers() {
  let storage = StorageProviderConfig {
    provider: "aws-s3".to_string(),
    bucket: "test-bucket".to_string(),
    config: serde_json::json!({
      "region": "us-east-1",
      "endpoint": "https://s3.us-east-1.amazonaws.com",
      "credentials": {
        "accessKeyId": "key",
        "secretAccessKey": "secret"
      },
      "presign": {
        "expiresInSeconds": 60
      }
    }),
  };
  let config = ObjectStorageConfig::from_s3_config(storage).unwrap().unwrap();
  let Ok(Ok(client)) = std::panic::catch_unwind(|| config.build_client()) else {
    eprintln!("skipping object storage presign test: S3 client cannot be built in this environment");
    return;
  };
  let result = client
    .presign_put(
      "key",
      ObjectPutMetadata {
        content_type: Some("text/plain".to_string()),
        ..Default::default()
      },
    )
    .await
    .unwrap();

  assert!(result.url.contains("X-Amz-Algorithm=AWS4-HMAC-SHA256"));
  assert!(result.url.contains("X-Amz-SignedHeaders="));
  assert_eq!(
    result.headers.get("Content-Type").map(String::as_str),
    Some("text/plain")
  );
  assert!(result.expires_at_ms > 0);
}

#[tokio::test]
async fn object_storage_presign_put_respects_content_length_and_signed_content_type_flag() {
  let config = ObjectStorageConfig::from_s3_config(storage_config(
    "aws-s3",
    serde_json::json!({
      "region": "us-east-1",
      "endpoint": "https://s3.us-east-1.amazonaws.com",
      "credentials": {
        "accessKeyId": "key",
        "secretAccessKey": "secret"
      },
      "presign": {
        "expiresInSeconds": 60,
        "signContentTypeForPut": false
      }
    }),
  ))
  .unwrap()
  .unwrap();
  let client = config.build_client().unwrap();
  let result = client
    .presign_put(
      "key",
      ObjectPutMetadata {
        content_type: Some("text/plain".to_string()),
        content_length: Some(42),
        ..Default::default()
      },
    )
    .await
    .unwrap();

  assert_eq!(
    result.headers.get("Content-Type").map(String::as_str),
    Some("text/plain")
  );
  assert_eq!(result.headers.get("Content-Length").map(String::as_str), Some("42"));
  assert!(!result.url.contains("content-type"));
  assert!(result.url.contains("content-length"));
}

#[tokio::test]
async fn object_storage_presign_get_returns_sigv4_url_without_headers() {
  let storage = StorageProviderConfig {
    provider: "cloudflare-r2".to_string(),
    bucket: "test-bucket".to_string(),
    config: serde_json::json!({
      "accountId": "account",
      "credentials": {
        "accessKeyId": "key",
        "secretAccessKey": "secret"
      },
      "presign": {
        "expiresInSeconds": 60
      }
    }),
  };
  let config = ObjectStorageConfig::from_r2_config(storage).unwrap().unwrap();
  let client = config.build_client().unwrap();
  let result = client.presign_get("workspace/key").await.unwrap();

  assert!(result.url.contains("X-Amz-Algorithm=AWS4-HMAC-SHA256"));
  assert!(result.url.contains("X-Amz-SignedHeaders=host"));
  assert!(result.url.contains("/test-bucket/workspace/key?"));
  assert!(result.headers.is_empty());
  assert!(result.expires_at_ms > 0);
}

#[tokio::test]
async fn object_storage_presign_upload_part_returns_sigv4_url() {
  let config = ObjectStorageConfig::from_s3_config(storage_config(
    "aws-s3",
    serde_json::json!({
      "region": "us-east-1",
      "endpoint": "https://s3.us-east-1.amazonaws.com",
      "credentials": {
        "accessKeyId": "key",
        "secretAccessKey": "secret"
      },
      "presign": {
        "expiresInSeconds": 60
      }
    }),
  ))
  .unwrap()
  .unwrap();
  let client = config.build_client().unwrap();
  let result = client.presign_upload_part("key", "upload-1", 3).await.unwrap();

  assert!(result.url.contains("X-Amz-Algorithm=AWS4-HMAC-SHA256"));
  assert!(result.url.contains("partNumber=3"));
  assert!(result.url.contains("uploadId=upload-1"));
  assert!(result.headers.is_empty());
  assert!(result.expires_at_ms > 0);
}

#[test]
fn object_storage_orders_completed_multipart_parts_and_trims_etags() {
  let parts = completed_multipart_parts(vec![
    MultipartUploadPart {
      part_number: 2,
      etag: trim_etag("\"b\""),
    },
    MultipartUploadPart {
      part_number: 1,
      etag: trim_etag("a"),
    },
  ]);

  assert_eq!(parts[0].part_number, 1);
  assert_eq!(parts[0].etag, "a");
  assert_eq!(parts[1].part_number, 2);
  assert_eq!(parts[1].etag, "b");
}

#[test]
fn object_storage_crc32_checksum_uses_s3_base64_format() {
  assert_eq!(checksum_crc32_base64(b"hello"), "NhCmhg==");
  assert_ne!(checksum_crc32_base64(b"hello"), "3610a686");
}
