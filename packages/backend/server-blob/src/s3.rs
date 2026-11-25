//! S3-compatible object storage over presigned `rusty-s3` requests sent with
//! `reqwest`, following the reference `ObjectStorageClient`
//! (`packages/backend/native/src/runtime/object_storage/client.rs`): signed
//! `content-type`/`content-length`/`x-amz-checksum-crc32` on PUT, and a 404
//! answered as a missing object.

use std::{collections::BTreeMap, time::Duration};

use chrono::Utc;
use reqwest::{
  Method, StatusCode,
  header::{CONTENT_LENGTH, CONTENT_TYPE, ETAG, HeaderMap, LAST_MODIFIED},
};
use rusty_s3::{
  Bucket, Credentials, S3Action, UrlStyle,
  actions::{
    AbortMultipartUpload, CompleteMultipartUpload, CreateMultipartUpload, DeleteObject, GetObject, HeadObject,
    ListObjectsV2, ListParts, PutObject, UploadPart,
  },
};
use url::Url;

use crate::storage::{
  BlobStorageBackend, MultipartUploadInit, ObjectMetadata, PresignedUpload, StorageBackendIdentity,
  StorageCapabilities, StorageError, UploadUrlConfig, UploadedPart, checksum_crc32_base64, normalize_storage_key,
  sign_proxy_upload_token, verify_proxy_upload_token,
};

const DEFAULT_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_PRESIGN_EXPIRES: Duration = Duration::from_secs(60);
const DIRECT_UPLOAD_PRESIGN_EXPIRES: Duration = Duration::from_secs(600);

/// Connection settings of one S3-compatible bucket.
#[derive(Clone)]
pub struct S3Config {
  /// `None` resolves the AWS endpoint of `region`.
  pub endpoint: Option<String>,
  pub region: String,
  pub bucket: String,
  pub access_key_id: String,
  pub secret_access_key: String,
  pub session_token: Option<String>,
  pub force_path_style: bool,
  pub request_timeout: Option<Duration>,
}

/// Optional direct/proxied upload policy attached to [`S3BlobStorage`].
#[derive(Clone, Default)]
pub struct S3UploadOptions {
  pub use_presigned_url: bool,
  pub proxy_upload: bool,
  pub upload_url_prefix: Option<String>,
  pub proxy_upload_secret: Option<String>,
}

impl std::fmt::Debug for S3UploadOptions {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    let sec = self.proxy_upload_secret.as_ref().map(|_| "[REDACTED]");
    f.debug_struct("S3UploadOptions")
      .field("use_presigned_url", &self.use_presigned_url)
      .field("proxy_upload", &self.proxy_upload)
      .field("upload_url_prefix", &self.upload_url_prefix)
      .field("proxy_upload_secret", &sec)
      .finish()
  }
}

impl std::fmt::Debug for S3Config {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    f.debug_struct("S3Config")
      .field("endpoint", &self.endpoint)
      .field("region", &self.region)
      .field("bucket", &self.bucket)
      .field("access_key_id", &self.access_key_id)
      .field("secret_access_key", &"[REDACTED]")
      .field("session_token", &self.session_token.as_ref().map(|_| "[REDACTED]"))
      .field("force_path_style", &self.force_path_style)
      .field("request_timeout", &self.request_timeout)
      .finish()
  }
}

#[derive(Clone)]
pub struct S3BlobStorage {
  bucket: Bucket,
  bucket_name: String,
  endpoint_url: String,
  credentials: Credentials,
  http: reqwest::Client,
  upload_options: S3UploadOptions,
}

fn resolve_s3_endpoint(region: &str) -> String {
  if region == "us-east-1" {
    "https://s3.amazonaws.com".to_owned()
  } else {
    format!("https://s3.{region}.amazonaws.com")
  }
}

/// `reqwest` errors are passed through `without_url` first: the request URL is
/// presigned and carries the credential scope and signature.
fn request_error(context: &str, err: impl std::fmt::Display) -> StorageError {
  StorageError::Request {
    context: context.to_owned(),
    message: err.to_string(),
  }
}

fn metadata_from_headers(headers: &HeaderMap) -> ObjectMetadata {
  let header = |name: &str| headers.get(name).and_then(|value| value.to_str().ok());
  ObjectMetadata {
    content_type: header(CONTENT_TYPE.as_str())
      .unwrap_or("application/octet-stream")
      .to_owned(),
    content_length: header(CONTENT_LENGTH.as_str())
      .and_then(|v| v.parse().ok())
      .unwrap_or(0),
    last_modified_ms: header(LAST_MODIFIED.as_str())
      .and_then(|v| chrono::DateTime::parse_from_rfc2822(v).ok())
      .map(|time| time.timestamp_millis())
      .unwrap_or(0),
    checksum_crc32: header("x-amz-checksum-crc32").map(str::to_owned),
  }
}

fn xml_unescape(raw: &str) -> String {
  let (mut out, mut rest) = (String::with_capacity(raw.len()), raw);
  while let Some(pos) = rest.find('&') {
    out.push_str(&rest[..pos]);
    rest = &rest[pos + 1..];
    if let Some(semi) = rest.find(';') {
      let ent = &rest[..semi];
      let ch = match ent {
        "amp" => Some('&'),
        "lt" => Some('<'),
        "gt" => Some('>'),
        "quot" => Some('"'),
        "apos" => Some('\''),
        _ if ent.starts_with("#x") || ent.starts_with("#X") => {
          u32::from_str_radix(&ent[2..], 16).ok().and_then(char::from_u32)
        }
        _ if ent.starts_with('#') => ent[1..].parse::<u32>().ok().and_then(char::from_u32),
        _ => None,
      };
      if let Some(ch) = ch {
        out.push(ch);
        rest = &rest[semi + 1..];
        continue;
      }
    }
    out.push('&');
  }
  out.push_str(rest);
  out
}

fn xml_escape(raw: &str) -> String {
  raw
    .replace('&', "&amp;")
    .replace('<', "&lt;")
    .replace('>', "&gt;")
    .replace('"', "&quot;")
    .replace('\'', "&apos;")
}

fn extract_xml_tag(xml: &str, tag: &str) -> Option<String> {
  let (open, close) = (format!("<{tag}>"), format!("</{tag}>"));
  let start = xml.find(&open)? + open.len();
  Some(xml_unescape(xml[start..start + xml[start..].find(&close)?].trim()))
}

fn extract_xml_tags(xml: &str, tag: &str) -> Vec<String> {
  let (open, close, mut out, mut cur) = (format!("<{tag}>"), format!("</{tag}>"), Vec::new(), xml);
  while let Some(s) = cur.find(&open) {
    let rest = &cur[s + open.len()..];
    let Some(e) = rest.find(&close) else { break };
    out.push(rest[..e].trim().to_owned());
    cur = &rest[e + close.len()..];
  }
  out
}

fn parse_list_parts_xml(xml: &str) -> Vec<UploadedPart> {
  extract_xml_tags(xml, "Part")
    .into_iter()
    .filter_map(|b| {
      let part_number = extract_xml_tag(&b, "PartNumber")?.parse::<i32>().ok()?;
      Some(UploadedPart {
        part_number,
        etag: extract_xml_tag(&b, "ETag")?,
      })
    })
    .collect()
}

impl S3BlobStorage {
  pub fn new(config: S3Config) -> Result<Self, StorageError> {
    if config.bucket.trim().is_empty() {
      return Err(StorageError::Config("S3 bucket must not be empty".into()));
    }
    if config.region.trim().is_empty() {
      return Err(StorageError::Config("S3 region must not be empty".into()));
    }
    let endpoint_str = config
      .endpoint
      .clone()
      .unwrap_or_else(|| resolve_s3_endpoint(&config.region));
    let endpoint = Url::parse(&endpoint_str).map_err(|err| StorageError::Config(format!("invalid endpoint: {err}")))?;
    let style = if config.force_path_style {
      UrlStyle::Path
    } else {
      UrlStyle::VirtualHost
    };
    let bucket_name = config.bucket.clone();
    let bucket = Bucket::new(endpoint, style, config.bucket, config.region)
      .map_err(|err| StorageError::Config(format!("invalid bucket url: {err}")))?;
    let credentials = match config.session_token.filter(|token| !token.is_empty()) {
      Some(token) => Credentials::new_with_token(config.access_key_id, config.secret_access_key, token),
      None => Credentials::new(config.access_key_id, config.secret_access_key),
    };
    let http = reqwest::Client::builder()
      .timeout(config.request_timeout.unwrap_or(DEFAULT_REQUEST_TIMEOUT))
      .build()
      .map_err(|err| StorageError::Config(format!("http client: {err}")))?;
    Ok(Self {
      bucket,
      bucket_name,
      endpoint_url: endpoint_str,
      credentials,
      http,
      upload_options: S3UploadOptions::default(),
    })
  }

  /// Attaches presigned and proxy upload options to this S3 storage client.
  pub fn with_upload_options(mut self, options: S3UploadOptions) -> Self {
    self.upload_options = options;
    self
  }

  async fn send(
    &self,
    context: &str,
    method: Method,
    url: Url,
    headers: &[(&str, String)],
    body: Option<Vec<u8>>,
  ) -> Result<reqwest::Response, StorageError> {
    let mut request = self.http.request(method, url);
    for (name, value) in headers {
      request = request.header(*name, value);
    }
    if let Some(body) = body {
      request = request.body(body);
    }
    request
      .send()
      .await
      .map_err(|err| request_error(context, err.without_url()))
  }

  async fn ensure_success(context: &str, response: reqwest::Response) -> Result<reqwest::Response, StorageError> {
    if response.status().is_success() {
      return Ok(response);
    }
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    Err(request_error(
      context,
      format!("HTTP {status}: {}", body.chars().take(512).collect::<String>()),
    ))
  }
  fn part_u16(n: i32) -> Result<u16, StorageError> {
    u16::try_from(n).map_err(|_| StorageError::InvalidKey(format!("invalid part number {n}")))
  }
  async fn send_xml(&self, ctx: &str, m: Method, url: Url, h: &[(&str, String)]) -> Result<String, StorageError> {
    let r = Self::ensure_success(ctx, self.send(ctx, m, url, h, None).await?).await?;
    r.text().await.map_err(|e| request_error(ctx, e.without_url()))
  }
  async fn head_req(&self, key: &str, msg: &str) -> Result<ObjectMetadata, StorageError> {
    self.head(key).await?.ok_or_else(|| StorageError::Metadata(msg.into()))
  }
}

#[async_trait::async_trait]
impl BlobStorageBackend for S3BlobStorage {
  async fn put(&self, key: &str, body: Vec<u8>, content_type: &str) -> Result<ObjectMetadata, StorageError> {
    normalize_storage_key(key)?;
    let checksum = checksum_crc32_base64(&body);
    let headers = [
      ("content-type", content_type.to_owned()),
      ("content-length", body.len().to_string()),
      ("x-amz-checksum-crc32", checksum.clone()),
    ];
    let mut action = PutObject::new(&self.bucket, Some(&self.credentials), key);
    for (name, value) in &headers {
      action.headers_mut().insert(*name, value.clone());
    }
    let url = action.sign(DEFAULT_PRESIGN_EXPIRES);
    let context = format!("put {key}");
    let response = self.send(&context, Method::PUT, url, &headers, Some(body)).await?;
    Self::ensure_success(&context, response).await?;
    Ok(ObjectMetadata {
      content_type: content_type.to_owned(),
      content_length: headers[1].1.parse().unwrap_or(0),
      last_modified_ms: crate::storage::now_ms(),
      checksum_crc32: Some(checksum),
    })
  }

  async fn get(&self, key: &str) -> Result<Option<(Vec<u8>, ObjectMetadata)>, StorageError> {
    normalize_storage_key(key)?;
    let url = GetObject::new(&self.bucket, Some(&self.credentials), key).sign(DEFAULT_PRESIGN_EXPIRES);
    let context = format!("get {key}");
    let response = self.send(&context, Method::GET, url, &[], None).await?;
    if response.status() == StatusCode::NOT_FOUND {
      return Ok(None);
    }
    let response = Self::ensure_success(&context, response).await?;
    let metadata = metadata_from_headers(response.headers());
    let body = response
      .bytes()
      .await
      .map_err(|err| request_error(&context, err.without_url()))?;
    Ok(Some((body.to_vec(), metadata)))
  }

  async fn head(&self, key: &str) -> Result<Option<ObjectMetadata>, StorageError> {
    normalize_storage_key(key)?;
    let url = HeadObject::new(&self.bucket, Some(&self.credentials), key).sign(DEFAULT_PRESIGN_EXPIRES);
    let context = format!("head {key}");
    let response = self.send(&context, Method::HEAD, url, &[], None).await?;
    if response.status() == StatusCode::NOT_FOUND {
      return Ok(None);
    }
    let response = Self::ensure_success(&context, response).await?;
    Ok(Some(metadata_from_headers(response.headers())))
  }

  async fn delete(&self, key: &str) -> Result<(), StorageError> {
    normalize_storage_key(key)?;
    let url = DeleteObject::new(&self.bucket, Some(&self.credentials), key).sign(DEFAULT_PRESIGN_EXPIRES);
    let context = format!("delete {key}");
    let response = self.send(&context, Method::DELETE, url, &[], None).await?;
    if response.status() == StatusCode::NOT_FOUND {
      return Ok(());
    }
    Self::ensure_success(&context, response).await?;
    Ok(())
  }

  fn capabilities(&self) -> StorageCapabilities {
    StorageCapabilities {
      presign_put: self.upload_options.use_presigned_url,
      multipart_direct: self.upload_options.use_presigned_url,
      proxy_upload: self.upload_options.use_presigned_url && self.upload_options.proxy_upload,
    }
  }

  fn upload_url_config(&self) -> Option<UploadUrlConfig> {
    self.upload_options.use_presigned_url.then(|| UploadUrlConfig {
      proxy_upload: self.upload_options.proxy_upload,
      url_prefix: self.upload_options.upload_url_prefix.clone(),
    })
  }
  fn sign_upload_token(&self, path: &str, fields: &[serde_json::Value], expires_at: i64) -> Option<String> {
    let sec = self.upload_options.proxy_upload_secret.as_deref()?;
    Some(sign_proxy_upload_token(sec, path, fields, expires_at))
  }
  fn verify_upload_token(&self, path: &str, fields: &[serde_json::Value], expires_at: i64, token: &str) -> bool {
    let Some(sec) = self.upload_options.proxy_upload_secret.as_deref() else {
      return false;
    };
    verify_proxy_upload_token(sec, path, fields, expires_at, token)
  }
  async fn presign_put(&self, k: &str, ct: &str, len: i64) -> Result<Option<PresignedUpload>, StorageError> {
    if !self.upload_options.use_presigned_url {
      return Ok(None);
    }
    normalize_storage_key(k)?;
    let mut action = PutObject::new(&self.bucket, Some(&self.credentials), k);
    let len_str = len.to_string();
    action.headers_mut().insert("content-type", ct);
    action.headers_mut().insert("content-length", len_str.as_str());
    Ok(Some(PresignedUpload {
      url: action.sign(DIRECT_UPLOAD_PRESIGN_EXPIRES).into(),
      headers: BTreeMap::from([("content-type".into(), ct.into()), ("content-length".into(), len_str)]),
      expires_at: Utc::now() + chrono::Duration::seconds(DIRECT_UPLOAD_PRESIGN_EXPIRES.as_secs() as i64),
    }))
  }
  async fn create_multipart_upload(&self, k: &str, ct: &str) -> Result<Option<MultipartUploadInit>, StorageError> {
    normalize_storage_key(k)?;
    let mut action = CreateMultipartUpload::new(&self.bucket, Some(&self.credentials), k);
    action.headers_mut().insert("content-type", ct);
    let hdrs = [("content-type", ct.to_owned())];
    let url = action.sign(DEFAULT_PRESIGN_EXPIRES);
    let xml = self
      .send_xml(&format!("create_multipart {k}"), Method::POST, url, &hdrs)
      .await?;
    let upload_id = extract_xml_tag(&xml, "UploadId")
      .ok_or_else(|| StorageError::Metadata("missing UploadId in S3 response".into()))?;
    Ok(Some(MultipartUploadInit {
      upload_id,
      expires_at: Utc::now() + chrono::Duration::hours(24),
    }))
  }
  async fn presign_upload_part(&self, k: &str, uid: &str, pn: i32) -> Result<Option<PresignedUpload>, StorageError> {
    if !self.upload_options.use_presigned_url {
      return Ok(None);
    }
    normalize_storage_key(k)?;
    let url = UploadPart::new(&self.bucket, Some(&self.credentials), k, Self::part_u16(pn)?, uid)
      .sign(DIRECT_UPLOAD_PRESIGN_EXPIRES);
    Ok(Some(PresignedUpload {
      url: url.into(),
      headers: BTreeMap::new(),
      expires_at: Utc::now() + chrono::Duration::seconds(DIRECT_UPLOAD_PRESIGN_EXPIRES.as_secs() as i64),
    }))
  }
  async fn upload_part(&self, k: &str, uid: &str, pn: i32, body: Vec<u8>) -> Result<String, StorageError> {
    normalize_storage_key(k)?;
    let headers = [("content-length", body.len().to_string())];
    let mut action = UploadPart::new(&self.bucket, Some(&self.credentials), k, Self::part_u16(pn)?, uid);
    action.headers_mut().insert("content-length", headers[0].1.as_str());
    let ctx = format!("upload_part {k}#{pn}");
    let url = action.sign(DEFAULT_PRESIGN_EXPIRES);
    let resp = self.send(&ctx, Method::PUT, url, &headers, Some(body)).await?;
    Self::ensure_success(&ctx, resp)
      .await?
      .headers()
      .get(ETAG)
      .and_then(|v| v.to_str().ok())
      .map(str::to_owned)
      .ok_or_else(|| StorageError::Metadata("missing ETag in S3 upload part response".into()))
  }
  async fn list_multipart_parts(&self, key: &str, upload_id: &str) -> Result<Option<Vec<UploadedPart>>, StorageError> {
    normalize_storage_key(key)?;
    let (mut all_parts, mut marker, ctx) = (Vec::new(), None::<String>, format!("list_parts {key}"));
    for _ in 0..1000 {
      let mut action = ListParts::new(&self.bucket, Some(&self.credentials), key, upload_id);
      if let Some(m) = marker.as_deref() {
        action.query_mut().insert("part-number-marker", m);
      }
      let resp = self
        .send(&ctx, Method::GET, action.sign(DEFAULT_PRESIGN_EXPIRES), &[], None)
        .await?;
      if resp.status() == StatusCode::NOT_FOUND {
        return Ok(None);
      }
      let xml = Self::ensure_success(&ctx, resp)
        .await?
        .text()
        .await
        .map_err(|e| request_error(&ctx, e.without_url()))?;
      all_parts.extend(parse_list_parts_xml(&xml));
      if !extract_xml_tag(&xml, "IsTruncated").is_some_and(|v| v.eq_ignore_ascii_case("true")) {
        break;
      }
      let Some(next) = extract_xml_tag(&xml, "NextPartNumberMarker").filter(|s| !s.is_empty()) else {
        break;
      };
      marker = Some(next);
    }
    all_parts.sort_by_key(|p| p.part_number);
    Ok(Some(all_parts))
  }
  async fn complete_multipart_upload(
    &self,
    key: &str,
    upload_id: &str,
    parts: &[UploadedPart],
  ) -> Result<ObjectMetadata, StorageError> {
    normalize_storage_key(key)?;
    let sorted = crate::storage::validate_multipart_parts(parts)?;
    let mut xml = String::from("<CompleteMultipartUpload>");
    for p in &sorted {
      xml.push_str(&format!(
        "<Part><PartNumber>{}</PartNumber><ETag>{}</ETag></Part>",
        p.part_number,
        xml_escape(&p.etag)
      ));
    }
    xml.push_str("</CompleteMultipartUpload>");
    let (body, ctx) = (xml.into_bytes(), format!("complete_multipart {key}"));
    let url = CompleteMultipartUpload::new(
      &self.bucket,
      Some(&self.credentials),
      key,
      upload_id,
      std::iter::empty::<&str>(),
    )
    .sign(DEFAULT_PRESIGN_EXPIRES);
    let headers = [
      ("content-type", "application/xml".to_owned()),
      ("content-length", body.len().to_string()),
    ];
    let resp = self.send(&ctx, Method::POST, url, &headers, Some(body)).await?;
    Self::ensure_success(&ctx, resp).await?;
    self.head_req(key, "completed multipart object missing on head").await
  }
  async fn abort_multipart_upload(&self, key: &str, upload_id: &str) -> Result<bool, StorageError> {
    normalize_storage_key(key)?;
    let url =
      AbortMultipartUpload::new(&self.bucket, Some(&self.credentials), key, upload_id).sign(DEFAULT_PRESIGN_EXPIRES);
    let ctx = format!("abort_multipart {key}");
    let resp = self.send(&ctx, Method::DELETE, url, &[], None).await?;
    if resp.status() == StatusCode::NOT_FOUND {
      return Ok(false);
    }
    Self::ensure_success(&ctx, resp).await?;
    Ok(true)
  }
  async fn promote_object(&self, src: &str, dst: &str, ct: &str) -> Result<ObjectMetadata, StorageError> {
    let segs = normalize_storage_key(src)?;
    normalize_storage_key(dst)?;
    let enc = |s: &String| -> String {
      s.bytes()
        .map(|b| {
          if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
            (b as char).to_string()
          } else {
            format!("%{b:02X}")
          }
        })
        .collect()
    };
    let enc_src = segs.iter().map(enc).collect::<Vec<_>>().join("/");
    let hdrs = [
      ("x-amz-copy-source", format!("/{}/{enc_src}", self.bucket_name)),
      ("x-amz-metadata-directive", "REPLACE".into()),
      ("content-type", ct.into()),
      ("content-length", "0".into()),
    ];
    let mut act = PutObject::new(&self.bucket, Some(&self.credentials), dst);
    for (k, v) in &hdrs {
      act.headers_mut().insert(*k, v.clone());
    }
    let ctx = format!("copy_object {src} -> {dst}");
    let r = self
      .send(
        &ctx,
        Method::PUT,
        act.sign(DEFAULT_PRESIGN_EXPIRES),
        &hdrs,
        Some(Vec::new()),
      )
      .await?;
    Self::ensure_success(&ctx, r).await?;
    self.head_req(dst, "promoted S3 object missing on head").await
  }
  async fn list_prefix(
    &self,
    pfx: &str,
    after: Option<&str>,
    lim: usize,
  ) -> Result<Vec<(String, Option<chrono::DateTime<Utc>>)>, StorageError> {
    let mut act = ListObjectsV2::new(&self.bucket, Some(&self.credentials));
    if !pfx.is_empty() {
      act.with_prefix(pfx);
    }
    if let Some(a) = after {
      act.with_start_after(a);
    }
    act.with_max_keys(lim.clamp(1, 1000));
    let xml = self
      .send_xml(
        &format!("list_prefix {pfx}"),
        Method::GET,
        act.sign(DEFAULT_PRESIGN_EXPIRES),
        &[],
      )
      .await?;
    Ok(
      extract_xml_tags(&xml, "Contents")
        .into_iter()
        .filter_map(|b| {
          let key = extract_xml_tag(&b, "Key")?;
          let lm = extract_xml_tag(&b, "LastModified")
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
            .map(|d| d.with_timezone(&Utc));
          Some((key, lm))
        })
        .collect(),
    )
  }
  fn backend_identity(&self) -> StorageBackendIdentity {
    StorageBackendIdentity {
      kind: "s3".into(),
      bucket: self.bucket_name.clone(),
      endpoint: Some(self.endpoint_url.clone()),
    }
  }
}
#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn s3_config_debug_redacts_secrets() {
    let config = S3Config {
      endpoint: None,
      region: "us-east-1".into(),
      bucket: "b".into(),
      access_key_id: "AKID".into(),
      secret_access_key: "super-secret-key".into(),
      session_token: Some("session-token-value".into()),
      force_path_style: false,
      request_timeout: None,
    };
    let debug = format!("{config:?}");
    assert!(debug.contains("AKID") && debug.contains("[REDACTED]"), "{debug}");
    for secret in ["super-secret-key", "session-token-value"] {
      assert!(!debug.contains(secret), "{debug}");
    }
  }
}
