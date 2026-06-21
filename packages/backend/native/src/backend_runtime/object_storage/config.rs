use aws_sdk_s3::config::{
  BehaviorVersion, Credentials, Region, RequestChecksumCalculation, ResponseChecksumValidation, timeout::TimeoutConfig,
};
use napi::Result;
use serde::Deserialize;

use super::{client::ObjectStorageClient, types::StorageProviderConfig};
use crate::backend_runtime::{
  config::blob_storage_config_from_config_files, error::napi_error, types::RuntimeObjectStorageHealth,
};

#[derive(Clone, Debug)]
pub(in crate::backend_runtime) struct ObjectStorageConfig {
  pub(super) provider: String,
  pub(super) bucket: String,
  pub(super) endpoint: Option<String>,
  pub(super) region: Option<String>,
  pub(super) access_key_id: Option<String>,
  pub(super) secret_access_key: Option<String>,
  pub(super) session_token: Option<String>,
  pub(super) force_path_style: bool,
  pub(super) request_timeout_ms: Option<u64>,
  pub(super) min_part_size: Option<u64>,
  pub(super) presign_expires_in_seconds: Option<u64>,
  pub(super) presign_sign_content_type_for_put: Option<bool>,
  pub(super) use_presigned_url: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct S3ConfigFile {
  endpoint: Option<String>,
  region: Option<String>,
  credentials: Option<S3CredentialsConfigFile>,
  force_path_style: Option<bool>,
  request_timeout_ms: Option<u64>,
  min_part_size: Option<u64>,
  presign: Option<S3PresignConfigFile>,
  #[serde(rename = "usePresignedURL")]
  use_presigned_url: Option<UsePresignedUrlConfigFile>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct R2ConfigFile {
  account_id: String,
  jurisdiction: Option<String>,
  region: Option<String>,
  credentials: Option<S3CredentialsConfigFile>,
  request_timeout_ms: Option<u64>,
  min_part_size: Option<u64>,
  presign: Option<S3PresignConfigFile>,
  #[serde(rename = "usePresignedURL")]
  use_presigned_url: Option<UsePresignedUrlConfigFile>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct S3CredentialsConfigFile {
  access_key_id: Option<String>,
  secret_access_key: Option<String>,
  session_token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct S3PresignConfigFile {
  expires_in_seconds: Option<u64>,
  sign_content_type_for_put: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UsePresignedUrlConfigFile {
  enabled: bool,
}

impl ObjectStorageConfig {
  pub(in crate::backend_runtime) fn from_config_files() -> Result<Option<Self>> {
    let Some(storage) = blob_storage_config_from_config_files()? else {
      return Ok(None);
    };

    match storage.provider.as_str() {
      "aws-s3" => Self::from_s3_config(storage),
      "cloudflare-r2" => Self::from_r2_config(storage),
      "fs" => Ok(None),
      provider => Err(napi_error(format!(
        "unsupported blob storage provider for BackendRuntime: {provider}"
      ))),
    }
  }

  pub(super) fn from_s3_config(storage: StorageProviderConfig) -> Result<Option<Self>> {
    let config: S3ConfigFile = serde_json::from_value(storage.config)
      .map_err(|err| napi_error(format!("invalid aws-s3 blob storage config: {err}")))?;
    let region = config
      .region
      .ok_or_else(|| napi_error("aws-s3 blob storage config requires region"))?;
    let endpoint = config.endpoint.or_else(|| Some(resolve_s3_endpoint(&region)));
    let credentials = config.credentials.unwrap_or_default();

    Ok(Some(Self {
      provider: storage.provider,
      bucket: storage.bucket,
      endpoint,
      region: Some(region),
      access_key_id: credentials.access_key_id,
      secret_access_key: credentials.secret_access_key,
      session_token: credentials.session_token,
      force_path_style: config.force_path_style.unwrap_or(false),
      request_timeout_ms: config.request_timeout_ms,
      min_part_size: config.min_part_size,
      presign_expires_in_seconds: config.presign.as_ref().and_then(|v| v.expires_in_seconds),
      presign_sign_content_type_for_put: config.presign.as_ref().and_then(|v| v.sign_content_type_for_put),
      use_presigned_url: config.use_presigned_url.map(|v| v.enabled).unwrap_or(false),
    }))
  }

  pub(super) fn from_r2_config(storage: StorageProviderConfig) -> Result<Option<Self>> {
    let config: R2ConfigFile = serde_json::from_value(storage.config)
      .map_err(|err| napi_error(format!("invalid cloudflare-r2 blob storage config: {err}")))?;
    let account = match config.jurisdiction {
      Some(jurisdiction) => format!("{}.{}", config.account_id, jurisdiction),
      None => config.account_id,
    };
    let credentials = config.credentials.unwrap_or_default();

    Ok(Some(Self {
      provider: storage.provider,
      bucket: storage.bucket,
      endpoint: Some(format!("https://{account}.r2.cloudflarestorage.com")),
      region: Some(config.region.unwrap_or_else(|| "auto".to_string())),
      access_key_id: credentials.access_key_id,
      secret_access_key: credentials.secret_access_key,
      session_token: credentials.session_token,
      force_path_style: true,
      request_timeout_ms: config.request_timeout_ms,
      min_part_size: config.min_part_size,
      presign_expires_in_seconds: config.presign.as_ref().and_then(|v| v.expires_in_seconds),
      presign_sign_content_type_for_put: config.presign.as_ref().and_then(|v| v.sign_content_type_for_put),
      use_presigned_url: config.use_presigned_url.map(|v| v.enabled).unwrap_or(false),
    }))
  }

  pub(super) fn build_client(&self) -> Result<ObjectStorageClient> {
    let region = self
      .region
      .clone()
      .ok_or_else(|| napi_error("object storage region is required"))?;
    let access_key_id = self
      .access_key_id
      .clone()
      .ok_or_else(|| napi_error("object storage accessKeyId is required"))?;
    let secret_access_key = self
      .secret_access_key
      .clone()
      .ok_or_else(|| napi_error("object storage secretAccessKey is required"))?;

    let credentials = Credentials::new(
      access_key_id,
      secret_access_key,
      self.session_token.clone(),
      None,
      "affine-server-config-json",
    );
    let mut builder = aws_sdk_s3::Config::builder()
      .behavior_version(BehaviorVersion::latest())
      .region(Region::new(region))
      .credentials_provider(credentials)
      .force_path_style(self.force_path_style)
      .request_checksum_calculation(RequestChecksumCalculation::WhenRequired)
      .response_checksum_validation(ResponseChecksumValidation::WhenRequired);

    if let Some(endpoint) = &self.endpoint {
      builder = builder.endpoint_url(endpoint);
    }
    if let Some(request_timeout_ms) = self.request_timeout_ms {
      builder = builder.timeout_config(
        TimeoutConfig::builder()
          .operation_timeout(std::time::Duration::from_millis(request_timeout_ms))
          .build(),
      );
    }

    Ok(ObjectStorageClient::new(
      builder.build(),
      self.bucket.clone(),
      self.presign_expires_in_seconds.unwrap_or(60),
      self.presign_sign_content_type_for_put.unwrap_or(true),
    ))
  }

  pub(super) fn health(&self) -> RuntimeObjectStorageHealth {
    let client_buildable = self
      .build_client()
      .map(|client| client.non_destructive_health())
      .unwrap_or(false);

    RuntimeObjectStorageHealth {
      configured: true,
      provider: Some(self.provider.clone()),
      bucket: Some(self.bucket.clone()),
      endpoint: self.endpoint.clone(),
      region: self.region.clone(),
      has_credentials: self.access_key_id.is_some()
        && self.secret_access_key.is_some()
        && self.session_token.as_ref().map(|v| !v.is_empty()).unwrap_or(true),
      force_path_style: self.force_path_style,
      request_timeout_ms: self.request_timeout_ms.map(|v| v as i64),
      min_part_size: self.min_part_size.map(|v| v as i64),
      presign_expires_in_seconds: self.presign_expires_in_seconds.map(|v| v as i64),
      presign_sign_content_type_for_put: self.presign_sign_content_type_for_put,
      use_presigned_url: self.use_presigned_url,
      client_buildable,
    }
  }
}

fn resolve_s3_endpoint(region: &str) -> String {
  if region == "us-east-1" {
    "https://s3.amazonaws.com".to_string()
  } else {
    format!("https://s3.{region}.amazonaws.com")
  }
}
