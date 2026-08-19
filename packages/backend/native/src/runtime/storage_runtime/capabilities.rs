use crate::runtime::object_storage::StorageBackendConfig;

#[napi_derive::napi(object)]
pub struct StorageProviderCapabilities {
  pub put: bool,
  pub get: bool,
  pub head: bool,
  pub list: bool,
  pub delete: bool,
  pub presign_put: bool,
  pub presign_get: bool,
  pub multipart_direct: bool,
  pub proxy_upload: bool,
  pub assetpack: bool,
  pub server_mediated_only: bool,
}

pub(super) fn storage_provider_capabilities(backend: &StorageBackendConfig) -> StorageProviderCapabilities {
  match backend {
    StorageBackendConfig::Fs(_) => StorageProviderCapabilities {
      put: true,
      get: true,
      head: true,
      list: true,
      delete: true,
      presign_put: false,
      presign_get: false,
      multipart_direct: false,
      proxy_upload: false,
      assetpack: false,
      server_mediated_only: true,
    },
    StorageBackendConfig::S3(config) => {
      let _configured_min_part_size = config.min_part_size;
      StorageProviderCapabilities {
        put: true,
        get: true,
        head: true,
        list: true,
        delete: true,
        presign_put: config.use_presigned_url,
        presign_get: config.use_presigned_url,
        multipart_direct: config.use_presigned_url,
        proxy_upload: config.proxy_upload,
        assetpack: false,
        server_mediated_only: !config.use_presigned_url,
      }
    }
    StorageBackendConfig::Assetpack(_) => StorageProviderCapabilities {
      put: true,
      get: true,
      head: true,
      list: true,
      delete: true,
      presign_put: false,
      presign_get: false,
      multipart_direct: false,
      proxy_upload: false,
      assetpack: true,
      server_mediated_only: true,
    },
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::runtime::object_storage::{FsStorageConfig, ObjectStorageConfig};

  #[test]
  fn capabilities_are_explicit_for_server_mediated_provider() {
    let capabilities = storage_provider_capabilities(&StorageBackendConfig::Fs(FsStorageConfig {
      provider: "fs".to_string(),
      root: "/tmp".to_string(),
      bucket: "blob".to_string(),
    }));
    assert!(capabilities.put);
    assert!(!capabilities.presign_put);
    assert!(capabilities.server_mediated_only);
  }

  #[test]
  fn capabilities_enable_presign_get_for_presigned_s3_provider() {
    let capabilities = storage_provider_capabilities(&StorageBackendConfig::S3(ObjectStorageConfig {
      provider: "cloudflare-r2".to_string(),
      bucket: "blob".to_string(),
      endpoint: Some("https://account.r2.cloudflarestorage.com".to_string()),
      region: Some("auto".to_string()),
      access_key_id: Some("key".to_string()),
      secret_access_key: Some("secret".to_string()),
      session_token: None,
      force_path_style: true,
      request_timeout_ms: None,
      min_part_size: None,
      presign_expires_in_seconds: Some(60),
      presign_sign_content_type_for_put: Some(true),
      use_presigned_url: true,
      proxy_upload: false,
      custom_get_url_prefix: None,
      custom_get_sign_key: None,
    }));

    assert!(capabilities.presign_put);
    assert!(capabilities.presign_get);
    assert!(capabilities.multipart_direct);
    assert!(!capabilities.server_mediated_only);
  }

  #[test]
  fn capabilities_expose_r2_proxy_upload() {
    let capabilities = storage_provider_capabilities(&StorageBackendConfig::S3(ObjectStorageConfig {
      provider: "cloudflare-r2".to_string(),
      bucket: "blob".to_string(),
      endpoint: Some("https://account.r2.cloudflarestorage.com".to_string()),
      region: Some("auto".to_string()),
      access_key_id: Some("key".to_string()),
      secret_access_key: Some("secret".to_string()),
      session_token: None,
      force_path_style: true,
      request_timeout_ms: None,
      min_part_size: None,
      presign_expires_in_seconds: Some(60),
      presign_sign_content_type_for_put: Some(true),
      use_presigned_url: true,
      proxy_upload: true,
      custom_get_url_prefix: None,
      custom_get_sign_key: None,
    }));

    assert!(capabilities.proxy_upload);
    assert!(capabilities.presign_put);
    assert!(capabilities.multipart_direct);
  }

  #[test]
  fn capabilities_are_explicit_for_assetpack_provider() {
    let capabilities = storage_provider_capabilities(&StorageBackendConfig::Assetpack(FsStorageConfig {
      provider: "assetpack".to_string(),
      root: "/tmp".to_string(),
      bucket: "blob".to_string(),
    }));

    assert!(capabilities.put);
    assert!(capabilities.get);
    assert!(capabilities.assetpack);
    assert!(!capabilities.presign_put);
    assert!(!capabilities.multipart_direct);
    assert!(capabilities.server_mediated_only);
  }
}
