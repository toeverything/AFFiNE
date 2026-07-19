use rusty_s3::{Bucket, Credentials, UrlStyle};
use serde::Deserialize;
use url::Url;

use super::{
  client::ObjectStorageClient,
  error::{ObjectStorageError, ObjectStorageResult},
  types::StorageProviderConfig,
};

#[derive(Clone, Debug)]
pub(crate) struct ObjectStorageConfig {
  pub(crate) provider: String,
  pub(crate) bucket: String,
  pub(crate) endpoint: Option<String>,
  pub(crate) region: Option<String>,
  pub(crate) access_key_id: Option<String>,
  pub(crate) secret_access_key: Option<String>,
  pub(crate) session_token: Option<String>,
  pub(crate) force_path_style: bool,
  pub(crate) request_timeout_ms: Option<u64>,
  pub(crate) min_part_size: Option<u64>,
  pub(crate) presign_expires_in_seconds: Option<u64>,
  pub(crate) presign_sign_content_type_for_put: Option<bool>,
  pub(crate) use_presigned_url: bool,
  pub(crate) proxy_upload: bool,
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
#[serde(rename_all = "camelCase")]
struct UsePresignedUrlConfigFile {
  enabled: bool,
  url_prefix: Option<String>,
  sign_key: Option<String>,
}

impl ObjectStorageConfig {
  pub(crate) fn from_provider_config(storage: Option<StorageProviderConfig>) -> ObjectStorageResult<Option<Self>> {
    let Some(storage) = storage else {
      return Ok(None);
    };

    match storage.provider.as_str() {
      "aws-s3" => Self::from_s3_config(storage),
      "cloudflare-r2" => Self::from_r2_config(storage),
      "fs" => Ok(None),
      provider => Err(ObjectStorageError::Config(format!(
        "unsupported blob storage provider for StorageRuntime: {provider}"
      ))),
    }
  }

  pub(crate) fn from_s3_config(storage: StorageProviderConfig) -> ObjectStorageResult<Option<Self>> {
    let config: S3ConfigFile = serde_json::from_value(storage.config)
      .map_err(|err| ObjectStorageError::Config(format!("invalid aws-s3 blob storage config: {err}")))?;
    let region = config
      .region
      .ok_or_else(|| ObjectStorageError::Config("aws-s3 blob storage config requires region".to_string()))?;
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
      proxy_upload: false,
    }))
  }

  pub(crate) fn from_r2_config(storage: StorageProviderConfig) -> ObjectStorageResult<Option<Self>> {
    let config: R2ConfigFile = serde_json::from_value(storage.config)
      .map_err(|err| ObjectStorageError::Config(format!("invalid cloudflare-r2 blob storage config: {err}")))?;
    let account = match config.jurisdiction {
      Some(jurisdiction) => format!("{}.{}", config.account_id, jurisdiction),
      None => config.account_id,
    };
    let credentials = config.credentials.unwrap_or_default();
    let (use_presigned_url, proxy_upload) = config
      .use_presigned_url
      .map(|value| {
        (
          value.enabled,
          value.enabled
            && value.url_prefix.as_ref().is_some_and(|prefix| !prefix.is_empty())
            && value.sign_key.as_ref().is_some_and(|key| !key.is_empty()),
        )
      })
      .unwrap_or((false, false));

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
      use_presigned_url,
      proxy_upload,
    }))
  }

  pub(crate) fn build_client(&self) -> ObjectStorageResult<ObjectStorageClient> {
    let region = self
      .region
      .clone()
      .ok_or_else(|| ObjectStorageError::Config("object storage region is required".to_string()))?;
    let access_key_id = self
      .access_key_id
      .clone()
      .ok_or_else(|| ObjectStorageError::Config("object storage accessKeyId is required".to_string()))?;
    let secret_access_key = self
      .secret_access_key
      .clone()
      .ok_or_else(|| ObjectStorageError::Config("object storage secretAccessKey is required".to_string()))?;

    let endpoint = self.endpoint.clone().unwrap_or_else(|| resolve_s3_endpoint(&region));
    let endpoint = Url::parse(&endpoint)
      .map_err(|err| ObjectStorageError::Config(format!("object storage endpoint is invalid: {err}")))?;
    let bucket = Bucket::new(
      endpoint,
      if self.force_path_style {
        UrlStyle::Path
      } else {
        UrlStyle::VirtualHost
      },
      self.bucket.clone(),
      region,
    )
    .map_err(|err| ObjectStorageError::Config(format!("object storage bucket url is invalid: {err}")))?;
    let credentials = match self.session_token.as_ref().filter(|token| !token.is_empty()) {
      Some(session_token) => Credentials::new_with_token(access_key_id, secret_access_key, session_token.clone()),
      None => Credentials::new(access_key_id, secret_access_key),
    };

    ObjectStorageClient::new(
      bucket,
      credentials,
      self.request_timeout_ms,
      self.presign_expires_in_seconds.unwrap_or(60),
      self.presign_sign_content_type_for_put.unwrap_or(true),
    )
  }
}

fn resolve_s3_endpoint(region: &str) -> String {
  if region == "us-east-1" {
    "https://s3.amazonaws.com".to_string()
  } else {
    format!("https://s3.{region}.amazonaws.com")
  }
}
