use std::time::{SystemTime, UNIX_EPOCH};

use base64::{
  Engine as _,
  engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
};
use hmac::{Hmac, KeyInit, Mac};
use rusty_s3::{Bucket, Credentials, UrlStyle};
use schemars::{JsonSchema, generate::SchemaSettings};
use serde::Deserialize;
use serde_json::{Value, json, to_value};
use sha2::Sha256;
use url::Url;

use super::{
  client::ObjectStorageClient,
  error::{ObjectStorageError, ObjectStorageResult},
  types::{ObjectKey, PresignedObjectRequest, StorageProviderConfig},
};

type HmacSha256 = Hmac<Sha256>;

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
  pub(crate) upload_url_prefix: Option<String>,
  pub(crate) proxy_sign_key: Option<String>,
  pub(crate) custom_get_url_prefix: Option<String>,
  pub(crate) custom_get_sign_key: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct S3ConfigFile {
  endpoint: Option<String>,
  region: String,
  credentials: Option<S3CredentialsConfigFile>,
  force_path_style: Option<bool>,
  request_timeout_ms: Option<u64>,
  min_part_size: Option<u64>,
  presign: Option<S3PresignConfigFile>,
  #[serde(rename = "usePresignedURL")]
  use_presigned_url: Option<UsePresignedUrlConfigFile>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct R2ConfigFile {
  account_id: String,
  jurisdiction: Option<R2Jurisdiction>,
  region: Option<String>,
  credentials: Option<S3CredentialsConfigFile>,
  request_timeout_ms: Option<u64>,
  min_part_size: Option<u64>,
  presign: Option<S3PresignConfigFile>,
  #[serde(rename = "usePresignedURL")]
  use_presigned_url: Option<UsePresignedUrlConfigFile>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
enum R2Jurisdiction {
  Default,
  Eu,
}

#[derive(Debug, Deserialize, Default, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct S3CredentialsConfigFile {
  access_key_id: Option<String>,
  secret_access_key: Option<String>,
  session_token: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct S3PresignConfigFile {
  expires_in_seconds: Option<u64>,
  sign_content_type_for_put: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct UsePresignedUrlConfigFile {
  enabled: bool,
  url_prefix: Option<String>,
  sign_key: Option<String>,
}

pub(in crate::runtime) fn storage_provider_schema() -> Value {
  let mut settings = SchemaSettings::draft07();
  settings.inline_subschemas = true;
  let s3 = to_value(settings.clone().into_generator().into_root_schema_for::<S3ConfigFile>())
    .expect("S3 schema should serialize");
  let r2 =
    to_value(settings.into_generator().into_root_schema_for::<R2ConfigFile>()).expect("R2 schema should serialize");
  let storage = |provider: &str, config: Value| {
    json!({
      "type": "object",
      "required": ["provider", "bucket", "config"],
      "properties": {
        "provider": { "const": provider },
        "bucket": { "type": "string" },
        "config": config
      }
    })
  };
  json!({
    "oneOf": [
      storage("fs", json!({ "type": "object", "required": ["path"], "properties": { "path": { "type": "string" } } })),
      storage("assetpack", json!({ "type": "object", "required": ["path"], "properties": { "path": { "type": "string" } } })),
      storage("aws-s3", s3),
      storage("cloudflare-r2", r2)
    ]
  })
}

impl UsePresignedUrlConfigFile {
  fn settings(
    self,
  ) -> (
    bool,
    bool,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
  ) {
    let prefix = self.url_prefix.filter(|value| !value.is_empty());
    let key = self.sign_key.filter(|value| !value.is_empty());
    let custom_get = self.enabled && prefix.is_some() && key.is_some();
    (
      self.enabled,
      self.enabled && key.is_some(),
      prefix.clone(),
      key.clone(),
      custom_get.then_some(prefix).flatten(),
      custom_get.then_some(key).flatten(),
    )
  }
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
    let region = config.region;
    let endpoint = config.endpoint.or_else(|| Some(resolve_s3_endpoint(&region)));
    let credentials = config.credentials.unwrap_or_default();
    let (use_presigned_url, proxy_upload, upload_url_prefix, proxy_sign_key, _, _) = config
      .use_presigned_url
      .map(UsePresignedUrlConfigFile::settings)
      .unwrap_or((false, false, None, None, None, None));

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
      use_presigned_url,
      proxy_upload,
      upload_url_prefix,
      proxy_sign_key,
      custom_get_url_prefix: None,
      custom_get_sign_key: None,
    }))
  }

  pub(crate) fn from_r2_config(storage: StorageProviderConfig) -> ObjectStorageResult<Option<Self>> {
    let config: R2ConfigFile = serde_json::from_value(storage.config)
      .map_err(|err| ObjectStorageError::Config(format!("invalid cloudflare-r2 blob storage config: {err}")))?;
    let account = match config.jurisdiction {
      Some(R2Jurisdiction::Eu) => format!("{}.eu", config.account_id),
      Some(R2Jurisdiction::Default) | None => config.account_id,
    };
    let credentials = config.credentials.unwrap_or_default();
    let (
      use_presigned_url,
      proxy_upload,
      upload_url_prefix,
      proxy_sign_key,
      custom_get_url_prefix,
      custom_get_sign_key,
    ) = config
      .use_presigned_url
      .map(UsePresignedUrlConfigFile::settings)
      .unwrap_or((false, false, None, None, None, None));

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
      upload_url_prefix,
      proxy_sign_key,
      custom_get_url_prefix,
      custom_get_sign_key,
    }))
  }

  pub(crate) fn proxy_upload_token(
    &self,
    path: &str,
    fields: &[Value],
    expires_at: i64,
  ) -> ObjectStorageResult<Option<String>> {
    // TODO(0.27.5): Review 0.27.4 upload URL compatibility after old instances
    // and URLs expire.
    let Some(key) = self.proxy_sign_key.as_ref().filter(|_| self.proxy_upload) else {
      return Ok(None);
    };
    let mut canonical = vec![json!("affine-storage-upload"), json!(1), json!("PUT"), json!(path)];
    canonical.extend_from_slice(fields);
    canonical.push(json!(expires_at));
    let payload = serde_json::to_vec(&canonical)
      .map_err(|err| ObjectStorageError::Config(format!("invalid upload token payload: {err}")))?;
    let mut mac = HmacSha256::new_from_slice(key.as_bytes())
      .map_err(|err| ObjectStorageError::Config(format!("invalid upload signing key: {err}")))?;
    mac.update(&payload);
    Ok(Some(URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())))
  }

  pub(crate) fn verify_proxy_upload_token(
    &self,
    path: &str,
    fields: &[Value],
    expires_at: i64,
    token: &str,
  ) -> ObjectStorageResult<bool> {
    let Some(key) = self.proxy_sign_key.as_ref().filter(|_| self.proxy_upload) else {
      return Ok(false);
    };
    let Ok(signature) = URL_SAFE_NO_PAD.decode(token) else {
      return Ok(false);
    };
    let mut canonical = vec![json!("affine-storage-upload"), json!(1), json!("PUT"), json!(path)];
    canonical.extend_from_slice(fields);
    canonical.push(json!(expires_at));
    let payload = serde_json::to_vec(&canonical)
      .map_err(|err| ObjectStorageError::Config(format!("invalid upload token payload: {err}")))?;
    let mut mac = HmacSha256::new_from_slice(key.as_bytes())
      .map_err(|err| ObjectStorageError::Config(format!("invalid upload signing key: {err}")))?;
    mac.update(&payload);
    Ok(mac.verify_slice(&signature).is_ok())
  }

  pub(crate) fn custom_presign_get(&self, key: &ObjectKey) -> ObjectStorageResult<Option<PresignedObjectRequest>> {
    let timestamp = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map_err(|err| ObjectStorageError::Config(format!("system time before unix epoch: {err}")))?
      .as_secs();
    self.custom_presign_get_at(key, timestamp)
  }

  pub(super) fn custom_presign_get_at(
    &self,
    key: &ObjectKey,
    timestamp: u64,
  ) -> ObjectStorageResult<Option<PresignedObjectRequest>> {
    let (Some(prefix), Some(sign_key)) = (
      self.custom_get_url_prefix.as_deref(),
      self.custom_get_sign_key.as_deref(),
    ) else {
      return Ok(None);
    };
    let mut url = Url::parse(prefix)
      .map_err(|err| ObjectStorageError::Config(format!("invalid object storage URL prefix: {err}")))?;
    if !matches!(url.scheme(), "http" | "https") || url.query().is_some() || url.fragment().is_some() {
      return Err(ObjectStorageError::Config(
        "object storage URL prefix must be an HTTP(S) URL without query or fragment".to_string(),
      ));
    }
    url
      .path_segments_mut()
      .map_err(|_| ObjectStorageError::Config("object storage URL prefix cannot be a base URL".to_string()))?
      .pop_if_empty()
      .extend(key.as_str().split('/'));
    let payload = format!("{}{timestamp}", url.path());
    let mut mac = HmacSha256::new_from_slice(sign_key.as_bytes())
      .map_err(|err| ObjectStorageError::Config(format!("invalid object storage signing key: {err}")))?;
    mac.update(payload.as_bytes());
    let signature = STANDARD.encode(mac.finalize().into_bytes());
    url
      .query_pairs_mut()
      .append_pair("sign", &format!("{timestamp}-{signature}"));

    Ok(Some(PresignedObjectRequest {
      url: url.to_string(),
      headers: Default::default(),
      expires_at_ms: i64::try_from(timestamp.saturating_add(self.presign_expires_in_seconds.unwrap_or(60)))
        .unwrap_or(i64::MAX)
        .saturating_mul(1000),
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
