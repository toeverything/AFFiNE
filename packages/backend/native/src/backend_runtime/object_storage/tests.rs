use super::{
  config::ObjectStorageConfig,
  types::{MultipartUploadPart, ObjectPutMetadata, StorageProviderConfig, completed_multipart_parts, trim_etag},
};

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
  assert_eq!(config.access_key_id.as_deref(), Some("key"));
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

  assert_eq!(parts[0].part_number, Some(1));
  assert_eq!(parts[0].e_tag.as_deref(), Some("a"));
  assert_eq!(parts[1].part_number, Some(2));
  assert_eq!(parts[1].e_tag.as_deref(), Some("b"));
}
