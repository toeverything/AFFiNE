use std::{
  collections::HashMap,
  future::Future,
  pin::Pin,
  time::{Duration, SystemTime},
};

use chrono::{DateTime, FixedOffset};
use reqwest::{
  Client as ReqwestClient, Method, StatusCode,
  header::{CONTENT_LENGTH, CONTENT_TYPE, ETAG, HeaderMap, HeaderName, HeaderValue, LAST_MODIFIED},
};
use rusty_s3::{
  Bucket, Credentials,
  actions::{
    AbortMultipartUpload, CompleteMultipartUpload, CreateMultipartUpload, DeleteObject, GetObject, HeadObject,
    ListObjectsV2, ListParts, PutObject, S3Action, UploadPart,
  },
};
use url::Url;

use super::{
  error::{ObjectStorageError, ObjectStorageResult},
  types::{
    MultipartUploadInitResult, MultipartUploadPart, ObjectGetResult, ObjectListEntry, ObjectListPage, ObjectMetadata,
    ObjectPutMetadata, PresignedObjectRequest, completed_multipart_parts, trim_etag,
  },
};

const MAX_RESPONSE_BODY_BYTES: usize = i32::MAX as usize;

type StorageHttpFuture<'a> = Pin<Box<dyn Future<Output = ObjectStorageResult<StorageHttpResponse>> + Send + 'a>>;

#[derive(Clone)]
struct StorageHttpRequest {
  method: Method,
  url: Url,
  headers: HashMap<String, String>,
  body: Option<Vec<u8>>,
  max_response_body_bytes: usize,
}

struct StorageHttpResponse {
  status: StatusCode,
  headers: HeaderMap,
  body: Vec<u8>,
}

trait StorageHttpClient: Clone + Send + Sync + 'static {
  fn execute(&self, request: StorageHttpRequest) -> StorageHttpFuture<'_>;
}

#[derive(Clone)]
struct ReqwestStorageHttpClient {
  client: ReqwestClient,
}

impl ReqwestStorageHttpClient {
  fn new(request_timeout_ms: Option<u64>) -> ObjectStorageResult<Self> {
    let mut builder = ReqwestClient::builder();
    if let Some(request_timeout_ms) = request_timeout_ms {
      builder = builder.timeout(Duration::from_millis(request_timeout_ms));
    }
    Ok(Self {
      client: builder.build().map_err(ObjectStorageError::HttpClientBuild)?,
    })
  }
}

impl StorageHttpClient for ReqwestStorageHttpClient {
  fn execute(&self, request: StorageHttpRequest) -> StorageHttpFuture<'_> {
    Box::pin(async move {
      let mut builder = self.client.request(request.method, request.url);
      for (key, value) in request.headers {
        let name =
          HeaderName::from_bytes(key.as_bytes()).map_err(|err| ObjectStorageError::InvalidHeader(err.to_string()))?;
        let value = HeaderValue::from_str(&value).map_err(|err| ObjectStorageError::InvalidHeader(err.to_string()))?;
        builder = builder.header(name, value);
      }
      if let Some(body) = request.body {
        builder = builder.body(body);
      }
      let mut response = builder.send().await.map_err(ObjectStorageError::HttpRequest)?;
      let status = response.status();
      let headers = response.headers().clone();
      if response
        .content_length()
        .is_some_and(|length| length > request.max_response_body_bytes as u64)
      {
        return Err(ObjectStorageError::BodyTooLarge {
          limit: request.max_response_body_bytes,
        });
      }
      let mut body = Vec::new();
      while let Some(chunk) = response.chunk().await.map_err(ObjectStorageError::HttpRequest)? {
        if body.len() + chunk.len() > request.max_response_body_bytes {
          return Err(ObjectStorageError::BodyTooLarge {
            limit: request.max_response_body_bytes,
          });
        }
        body.extend_from_slice(&chunk);
      }
      Ok(StorageHttpResponse { status, headers, body })
    })
  }
}

#[derive(Clone)]
pub(crate) struct ObjectStorageClient {
  bucket: Bucket,
  credentials: Credentials,
  http: ReqwestStorageHttpClient,
  presign_expires_in_seconds: u64,
  presign_sign_content_type_for_put: bool,
}

impl ObjectStorageClient {
  pub(crate) fn new(
    bucket: Bucket,
    credentials: Credentials,
    request_timeout_ms: Option<u64>,
    presign_expires_in_seconds: u64,
    presign_sign_content_type_for_put: bool,
  ) -> ObjectStorageResult<Self> {
    Ok(Self {
      bucket,
      credentials,
      http: ReqwestStorageHttpClient::new(request_timeout_ms)?,
      presign_expires_in_seconds,
      presign_sign_content_type_for_put,
    })
  }

  pub(crate) async fn put(
    &self,
    key: &str,
    body: Vec<u8>,
    metadata: ObjectPutMetadata,
  ) -> ObjectStorageResult<ObjectMetadata> {
    let metadata = metadata.complete_for_body(&body);
    let object_metadata = metadata.clone().into_object_metadata(
      crate::utils::system_time_millis(SystemTime::now())
        .map(|millis| millis as i64)
        .map_err(|err| ObjectStorageError::InvalidInput(format!("system time before unix epoch: {err}")))?,
    );
    let mut headers = HashMap::from([
      ("content-type".to_string(), object_metadata.content_type.clone()),
      ("content-length".to_string(), object_metadata.content_length.to_string()),
    ]);
    if let Some(checksum) = object_metadata.checksum_crc32.clone() {
      headers.insert("x-amz-checksum-crc32".to_string(), checksum);
    }

    let mut action = PutObject::new(&self.bucket, Some(&self.credentials), key);
    insert_action_headers(&mut action, &headers);
    let response = self
      .http
      .execute(StorageHttpRequest {
        method: Method::PUT,
        url: action.sign(expires_in(self.presign_expires_in_seconds)),
        headers,
        body: Some(body),
        max_response_body_bytes: MAX_RESPONSE_BODY_BYTES,
      })
      .await
      .map_err(|source| operation_error(format!("ObjectStorage put failed for {key}"), source))?;
    ensure_success_status(&response, &format!("ObjectStorage put failed for {key}"))?;
    Ok(object_metadata)
  }

  pub(crate) async fn presign_put(
    &self,
    key: &str,
    metadata: ObjectPutMetadata,
  ) -> ObjectStorageResult<PresignedObjectRequest> {
    let content_type = metadata
      .content_type
      .unwrap_or_else(|| "application/octet-stream".to_string());
    let mut headers = HashMap::new();
    headers.insert("Content-Type".to_string(), content_type.clone());
    if let Some(content_length) = metadata.content_length {
      headers.insert("Content-Length".to_string(), content_length.to_string());
    }

    let mut action = PutObject::new(&self.bucket, Some(&self.credentials), key);
    if self.presign_sign_content_type_for_put {
      action.headers_mut().insert("content-type", content_type);
    }
    if let Some(content_length) = metadata.content_length {
      action
        .headers_mut()
        .insert("content-length", content_length.to_string());
    }

    Ok(PresignedObjectRequest {
      url: action.sign(expires_in(self.presign_expires_in_seconds)).to_string(),
      headers,
      expires_at_ms: expires_at_ms(self.presign_expires_in_seconds)?,
    })
  }

  pub(crate) async fn presign_get(&self, key: &str) -> ObjectStorageResult<PresignedObjectRequest> {
    let action = GetObject::new(&self.bucket, Some(&self.credentials), key);
    Ok(PresignedObjectRequest {
      url: action.sign(expires_in(self.presign_expires_in_seconds)).to_string(),
      headers: HashMap::new(),
      expires_at_ms: expires_at_ms(self.presign_expires_in_seconds)?,
    })
  }

  pub(crate) async fn create_multipart_upload(
    &self,
    key: &str,
    metadata: ObjectPutMetadata,
  ) -> ObjectStorageResult<Option<MultipartUploadInitResult>> {
    let mut action = CreateMultipartUpload::new(&self.bucket, Some(&self.credentials), key);
    if let Some(content_type) = metadata.content_type {
      action.headers_mut().insert("content-type", content_type.clone());
      let headers = HashMap::from([("content-type".to_string(), content_type)]);
      return self.create_multipart_upload_with_headers(key, action, headers).await;
    }
    self
      .create_multipart_upload_with_headers(key, action, HashMap::new())
      .await
  }

  async fn create_multipart_upload_with_headers(
    &self,
    key: &str,
    action: CreateMultipartUpload<'_>,
    headers: HashMap<String, String>,
  ) -> ObjectStorageResult<Option<MultipartUploadInitResult>> {
    let response = self
      .http
      .execute(StorageHttpRequest {
        method: Method::POST,
        url: action.sign(expires_in(self.presign_expires_in_seconds)),
        headers,
        body: None,
        max_response_body_bytes: MAX_RESPONSE_BODY_BYTES,
      })
      .await
      .map_err(|source| {
        operation_error(
          format!("ObjectStorage create multipart upload failed for {key}"),
          source,
        )
      })?;
    let body = ensure_success_text(
      response,
      format!("ObjectStorage create multipart upload failed for {key}"),
    )?;
    let parsed = CreateMultipartUpload::parse_response(&body).map_err(|source| ObjectStorageError::InvalidXml {
      context: format!("ObjectStorage parse multipart upload response failed for {key}"),
      source,
    })?;
    Ok(Some(MultipartUploadInitResult {
      upload_id: parsed.upload_id().to_string(),
      expires_at_ms: expires_at_ms(self.presign_expires_in_seconds)?,
    }))
  }

  pub(crate) async fn presign_upload_part(
    &self,
    key: &str,
    upload_id: &str,
    part_number: i32,
  ) -> ObjectStorageResult<PresignedObjectRequest> {
    let part_number = checked_part_number(part_number)?;
    let action = UploadPart::new(&self.bucket, Some(&self.credentials), key, part_number, upload_id);
    Ok(PresignedObjectRequest {
      url: action.sign(expires_in(self.presign_expires_in_seconds)).to_string(),
      headers: HashMap::new(),
      expires_at_ms: expires_at_ms(self.presign_expires_in_seconds)?,
    })
  }

  pub(crate) async fn upload_part(
    &self,
    key: &str,
    upload_id: &str,
    part_number: i32,
    body: Vec<u8>,
    content_length: Option<i64>,
  ) -> ObjectStorageResult<Option<String>> {
    let part_number = checked_part_number(part_number)?;
    let mut action = UploadPart::new(&self.bucket, Some(&self.credentials), key, part_number, upload_id);
    let mut headers = HashMap::new();
    if let Some(content_length) = content_length {
      action
        .headers_mut()
        .insert("content-length", content_length.to_string());
      headers.insert("content-length".to_string(), content_length.to_string());
    }
    let response = self
      .http
      .execute(StorageHttpRequest {
        method: Method::PUT,
        url: action.sign(expires_in(self.presign_expires_in_seconds)),
        headers,
        body: Some(body),
        max_response_body_bytes: MAX_RESPONSE_BODY_BYTES,
      })
      .await
      .map_err(|source| operation_error(format!("ObjectStorage upload multipart part failed for {key}"), source))?;
    ensure_success_status(
      &response,
      &format!("ObjectStorage upload multipart part failed for {key}"),
    )?;
    Ok(response_header(&response.headers, ETAG).as_deref().map(trim_etag))
  }

  pub(crate) async fn list_multipart_upload_parts(
    &self,
    key: &str,
    upload_id: &str,
  ) -> ObjectStorageResult<Vec<MultipartUploadPart>> {
    let mut parts = Vec::new();
    let mut marker = None;
    loop {
      let mut action = ListParts::new(&self.bucket, Some(&self.credentials), key, upload_id);
      if let Some(marker) = marker {
        action.set_part_number_marker(marker);
      }
      let response = self
        .http
        .execute(StorageHttpRequest {
          method: Method::GET,
          url: action.sign(expires_in(self.presign_expires_in_seconds)),
          headers: HashMap::new(),
          body: None,
          max_response_body_bytes: MAX_RESPONSE_BODY_BYTES,
        })
        .await
        .map_err(|source| {
          operation_error(
            format!("ObjectStorage list multipart upload parts failed for {key}"),
            source,
          )
        })?;
      if response.status == StatusCode::NOT_FOUND && is_not_found_body(&response.body) {
        return Ok(Vec::new());
      }
      let body = ensure_success_text(
        response,
        format!("ObjectStorage list multipart upload parts failed for {key}"),
      )?;
      let parsed = ListParts::parse_response(&body).map_err(|source| ObjectStorageError::InvalidXml {
        context: format!("ObjectStorage parse multipart parts failed for {key}"),
        source,
      })?;
      parts.extend(parsed.parts.into_iter().map(|part| MultipartUploadPart {
        part_number: i32::from(part.number),
        etag: trim_etag(&part.etag),
      }));
      let Some(next_marker) = parsed.next_part_number_marker else {
        break;
      };
      marker = Some(next_marker);
    }
    Ok(parts)
  }

  pub(crate) async fn complete_multipart_upload(
    &self,
    key: &str,
    upload_id: &str,
    parts: Vec<MultipartUploadPart>,
  ) -> ObjectStorageResult<()> {
    let ordered_parts = completed_multipart_parts(parts);
    validate_completed_parts(&ordered_parts)?;
    let etags = ordered_parts.iter().map(|part| part.etag.as_str());
    let action = CompleteMultipartUpload::new(&self.bucket, Some(&self.credentials), key, upload_id, etags);
    let url = action.sign(expires_in(self.presign_expires_in_seconds));
    let body = complete_multipart_body(&ordered_parts);
    let response = self
      .http
      .execute(StorageHttpRequest {
        method: Method::POST,
        url,
        headers: HashMap::from([("content-type".to_string(), "application/xml".to_string())]),
        body: Some(body.into_bytes()),
        max_response_body_bytes: MAX_RESPONSE_BODY_BYTES,
      })
      .await
      .map_err(|source| {
        operation_error(
          format!("ObjectStorage complete multipart upload failed for {key}"),
          source,
        )
      })?;
    ensure_success_status(
      &response,
      &format!("ObjectStorage complete multipart upload failed for {key}"),
    )?;
    Ok(())
  }

  pub(crate) async fn abort_multipart_upload(&self, key: &str, upload_id: &str) -> ObjectStorageResult<()> {
    let action = AbortMultipartUpload::new(&self.bucket, Some(&self.credentials), key, upload_id);
    let response = self
      .http
      .execute(StorageHttpRequest {
        method: Method::DELETE,
        url: action.sign(expires_in(self.presign_expires_in_seconds)),
        headers: HashMap::new(),
        body: None,
        max_response_body_bytes: MAX_RESPONSE_BODY_BYTES,
      })
      .await
      .map_err(|source| operation_error(format!("ObjectStorage abort multipart upload failed for {key}"), source))?;
    ensure_success_status(
      &response,
      &format!("ObjectStorage abort multipart upload failed for {key}"),
    )?;
    Ok(())
  }

  pub(crate) async fn head(&self, key: &str) -> ObjectStorageResult<Option<ObjectMetadata>> {
    let action = HeadObject::new(&self.bucket, Some(&self.credentials), key);
    let response = self
      .http
      .execute(StorageHttpRequest {
        method: Method::HEAD,
        url: action.sign(expires_in(self.presign_expires_in_seconds)),
        headers: HashMap::new(),
        body: None,
        max_response_body_bytes: MAX_RESPONSE_BODY_BYTES,
      })
      .await
      .map_err(|source| operation_error(format!("ObjectStorage head failed for {key}"), source))?;
    if response.status == StatusCode::NOT_FOUND {
      let get_action = GetObject::new(&self.bucket, Some(&self.credentials), key);
      let get_response = self
        .http
        .execute(StorageHttpRequest {
          method: Method::GET,
          url: get_action.sign(expires_in(self.presign_expires_in_seconds)),
          headers: HashMap::new(),
          body: None,
          max_response_body_bytes: MAX_RESPONSE_BODY_BYTES,
        })
        .await
        .map_err(|source| operation_error(format!("ObjectStorage head missing check failed for {key}"), source))?;
      if get_response.status == StatusCode::NOT_FOUND && is_not_found_body(&get_response.body) {
        return Ok(None);
      }
      ensure_success_status(
        &get_response,
        &format!("ObjectStorage head missing check failed for {key}"),
      )?;
      return Ok(Some(metadata_from_headers(&get_response.headers)));
    }
    ensure_success_status(&response, &format!("ObjectStorage head failed for {key}"))?;
    Ok(Some(metadata_from_headers(&response.headers)))
  }

  pub(crate) async fn get(&self, key: &str) -> ObjectStorageResult<Option<ObjectGetResult>> {
    let action = GetObject::new(&self.bucket, Some(&self.credentials), key);
    let response = self
      .http
      .execute(StorageHttpRequest {
        method: Method::GET,
        url: action.sign(expires_in(self.presign_expires_in_seconds)),
        headers: HashMap::new(),
        body: None,
        max_response_body_bytes: MAX_RESPONSE_BODY_BYTES,
      })
      .await
      .map_err(|source| operation_error(format!("ObjectStorage get failed for {key}"), source))?;
    if response.status == StatusCode::NOT_FOUND && is_not_found_body(&response.body) {
      return Ok(None);
    }
    ensure_success_status(&response, &format!("ObjectStorage get failed for {key}"))?;
    let metadata = metadata_from_headers(&response.headers);
    Ok(Some(ObjectGetResult {
      body: response.body,
      metadata,
    }))
  }

  pub(crate) async fn list(&self, prefix: Option<String>) -> ObjectStorageResult<Vec<ObjectListEntry>> {
    let mut entries = Vec::new();
    let mut token = None;
    loop {
      let page = self.list_page(prefix.clone(), token, None, 1000).await?;
      entries.extend(page.entries);
      if let Some(next_token) = page.next_continuation_token {
        token = Some(next_token);
      } else {
        break;
      }
    }
    Ok(entries)
  }

  pub(crate) async fn list_page(
    &self,
    prefix: Option<String>,
    continuation_token: Option<String>,
    start_after: Option<String>,
    max_keys: i32,
  ) -> ObjectStorageResult<ObjectListPage> {
    let max_keys = usize::try_from(max_keys)
      .map_err(|_| ObjectStorageError::InvalidInput("maxKeys must be positive".to_string()))?;
    let mut action = ListObjectsV2::new(&self.bucket, Some(&self.credentials));
    action.with_max_keys(max_keys);
    if let Some(prefix) = &prefix {
      action.with_prefix(prefix.clone());
    }
    if let Some(continuation_token) = &continuation_token {
      action.with_continuation_token(continuation_token.clone());
    } else if let Some(start_after) = &start_after {
      action.with_start_after(start_after.clone());
    }
    let response = self
      .http
      .execute(StorageHttpRequest {
        method: Method::GET,
        url: action.sign(expires_in(self.presign_expires_in_seconds)),
        headers: HashMap::new(),
        body: None,
        max_response_body_bytes: MAX_RESPONSE_BODY_BYTES,
      })
      .await
      .map_err(|source| operation_error("ObjectStorage list page failed", source))?;
    let body = ensure_success_text(response, "ObjectStorage list page failed".to_string())?;
    let parsed = ListObjectsV2::parse_response(&body).map_err(|source| ObjectStorageError::InvalidXml {
      context: "ObjectStorage parse list response failed".to_string(),
      source,
    })?;
    Ok(ObjectListPage {
      entries: parsed
        .contents
        .into_iter()
        .map(|object| ObjectListEntry {
          key: object.key,
          content_length: i64::try_from(object.size).unwrap_or(i64::MAX),
          last_modified_ms: parse_rfc3339_ms(&object.last_modified),
        })
        .collect(),
      next_continuation_token: parsed.next_continuation_token,
    })
  }

  pub(crate) async fn delete(&self, key: &str) -> ObjectStorageResult<()> {
    let action = DeleteObject::new(&self.bucket, Some(&self.credentials), key);
    let response = self
      .http
      .execute(StorageHttpRequest {
        method: Method::DELETE,
        url: action.sign(expires_in(self.presign_expires_in_seconds)),
        headers: HashMap::new(),
        body: None,
        max_response_body_bytes: MAX_RESPONSE_BODY_BYTES,
      })
      .await
      .map_err(|source| operation_error(format!("ObjectStorage delete failed for {key}"), source))?;
    ensure_success_status(&response, &format!("ObjectStorage delete failed for {key}"))?;
    Ok(())
  }
}

fn insert_action_headers<'a, T: S3Action<'a>>(action: &mut T, headers: &HashMap<String, String>) {
  for (key, value) in headers {
    action.headers_mut().insert(key.clone(), value.clone());
  }
}

fn operation_error(context: impl Into<String>, source: ObjectStorageError) -> ObjectStorageError {
  ObjectStorageError::Operation {
    context: context.into(),
    source: Box::new(source),
  }
}

fn ensure_success_text(response: StorageHttpResponse, context: String) -> ObjectStorageResult<String> {
  ensure_success_status(&response, &context)?;
  String::from_utf8(response.body).map_err(|source| ObjectStorageError::InvalidUtf8 { context, source })
}

fn ensure_success_status(response: &StorageHttpResponse, context: &str) -> ObjectStorageResult<()> {
  if response.status.is_success() {
    return Ok(());
  }
  let body = String::from_utf8_lossy(&response.body);
  Err(ObjectStorageError::HttpStatus {
    context: context.to_string(),
    status: response.status,
    body: body.to_string(),
  })
}

fn is_not_found_body(body: &[u8]) -> bool {
  let body = String::from_utf8_lossy(body);
  body.contains("<Code>NoSuchKey</Code>")
    || body.contains("<Code>NotFound</Code>")
    || body.contains("<Code>NoSuchUpload</Code>")
}

fn metadata_from_headers(headers: &HeaderMap) -> ObjectMetadata {
  ObjectMetadata {
    content_type: response_header(headers, CONTENT_TYPE).unwrap_or_else(|| "application/octet-stream".to_string()),
    content_length: response_header(headers, CONTENT_LENGTH)
      .and_then(|value| value.parse::<i64>().ok())
      .unwrap_or(0),
    last_modified_ms: response_header(headers, LAST_MODIFIED)
      .and_then(|value| DateTime::<FixedOffset>::parse_from_rfc2822(&value).ok())
      .map(|value| value.timestamp_millis())
      .unwrap_or(0),
    checksum_crc32: response_header_name(headers, "x-amz-checksum-crc32"),
  }
}

fn response_header(headers: &HeaderMap, name: HeaderName) -> Option<String> {
  headers
    .get(name)
    .and_then(|value| value.to_str().ok())
    .map(ToString::to_string)
}

fn response_header_name(headers: &HeaderMap, name: &str) -> Option<String> {
  headers
    .get(name)
    .and_then(|value| value.to_str().ok())
    .map(ToString::to_string)
}

fn checked_part_number(part_number: i32) -> ObjectStorageResult<u16> {
  u16::try_from(part_number).map_err(|_| ObjectStorageError::InvalidInput("part number must fit u16".to_string()))
}

fn validate_completed_parts(parts: &[MultipartUploadPart]) -> ObjectStorageResult<()> {
  for part in parts {
    checked_part_number(part.part_number)?;
    if part.etag.is_empty() {
      return Err(ObjectStorageError::InvalidInput(
        "multipart part etag is required".to_string(),
      ));
    }
  }
  Ok(())
}

fn complete_multipart_body(parts: &[MultipartUploadPart]) -> String {
  let mut body = String::from("<CompleteMultipartUpload>");
  for part in parts {
    body.push_str("<Part><ETag>");
    body.push_str(&xml_escape(&part.etag));
    body.push_str("</ETag><PartNumber>");
    body.push_str(&part.part_number.to_string());
    body.push_str("</PartNumber></Part>");
  }
  body.push_str("</CompleteMultipartUpload>");
  body
}

fn xml_escape(value: &str) -> String {
  value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

fn expires_in(seconds: u64) -> Duration {
  Duration::from_secs(seconds)
}

fn expires_at_ms(expires_in_seconds: u64) -> ObjectStorageResult<i64> {
  let expires_at = SystemTime::now()
    .checked_add(Duration::from_secs(expires_in_seconds))
    .ok_or_else(|| ObjectStorageError::InvalidInput("presign expiration overflow".to_string()))?;
  crate::utils::system_time_millis(expires_at)
    .map(|millis| millis as i64)
    .map_err(|err| ObjectStorageError::InvalidInput(format!("system time before unix epoch: {err}")))
}

fn parse_rfc3339_ms(value: &str) -> i64 {
  DateTime::parse_from_rfc3339(value)
    .map(|value| value.timestamp_millis())
    .unwrap_or(0)
}
