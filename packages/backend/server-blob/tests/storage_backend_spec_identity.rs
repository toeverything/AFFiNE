//! `StorageBackendSpec::backend_identity` reports the identity that the built
//! backend reports, for `fs`, `assetpack`, `aws-s3`, and `cloudflare-r2`.

use server_blob::StorageBackendSpec;

#[test]
fn spec_identity_matches_the_built_backend_identity() {
  let root = std::env::temp_dir().join(format!("server-blob-identity-{}", uuid::Uuid::new_v4().simple()));
  let root = root.to_str().unwrap();
  let credentials = serde_json::json!({ "accessKeyId": "ak", "secretAccessKey": "sk" });
  for raw in [
    serde_json::json!({ "provider": "fs", "bucket": "blobs", "config": { "path": root } }),
    serde_json::json!({ "provider": "fs", "bucket": "blobs", "config": { "path": "~/.affine/storage" } }),
    serde_json::json!({ "provider": "assetpack", "bucket": "blobs", "config": { "path": root } }),
    serde_json::json!({ "provider": "aws-s3", "bucket": "blobs", "config": { "region": "eu-west-1", "credentials": credentials } }),
    serde_json::json!({ "provider": "aws-s3", "bucket": "blobs", "config": { "region": "us-east-1", "endpoint": "http://127.0.0.1:9", "forcePathStyle": true, "credentials": credentials } }),
    serde_json::json!({ "provider": "cloudflare-r2", "bucket": "blobs", "config": { "accountId": "acct", "jurisdiction": "eu", "credentials": credentials } }),
  ] {
    let spec = StorageBackendSpec::from_app_config_json(&raw, "blobs")
      .unwrap()
      .unwrap();
    assert_eq!(
      spec.backend_identity().unwrap(),
      spec.build().unwrap().backend_identity(),
      "{raw}"
    );
  }
  let _ = std::fs::remove_dir_all(root);
}
