use std::{
  collections::HashMap,
  time::{Duration, SystemTime},
};

use chrono::{DateTime, FixedOffset};
use reqwest::{
  Client as ReqwestClient, Method, StatusCode,
  header::{CONTENT_LENGTH, CONTENT_TYPE, ETAG, HeaderMap, HeaderName, HeaderValue, LAST_MODIFIED},
};
use rustls::RootCertStore;
use rusty_s3::{
  Bucket, Credentials,
  actions::{
    AbortMultipartUpload, CompleteMultipartUpload, CreateMultipartUpload, DeleteObject, DeleteObjects,
    DeleteObjectsResponse, GetObject, HeadObject, ListObjectsV2, ListParts, ObjectIdentifier, PutObject, S3Action,
    UploadPart,
  },
};
use tokio::time::sleep;
use url::Url;

use super::{
  error::{ObjectStorageError, ObjectStorageResult},
  types::{
    MultipartUploadInitResult, MultipartUploadPart, ObjectDeleteOutcome, ObjectGetResult, ObjectListEntry,
    ObjectListPage, ObjectMetadata, ObjectPutMetadata, PresignedObjectRequest, completed_multipart_parts, trim_etag,
  },
};

const DEFAULT_REQUEST_TIMEOUT_MS: u64 = 30_000;
const MAX_MULTIPART_PART_NUMBER: i32 = 10_000;
const MAX_RESPONSE_BODY_BYTES: usize = i32::MAX as usize;
const DELETE_OBJECTS_MAX_KEYS: usize = 1000;
const DELETE_OBJECTS_MAX_ATTEMPTS: usize = 5;
const DELETE_OBJECTS_BACKOFF_BASE_MS: u64 = 1_000;
const DELETE_OBJECTS_BACKOFF_MAX_MS: u64 = 30_000;

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

#[derive(Clone)]
struct ReqwestStorageHttpClient {
  client: ReqwestClient,
}

impl ReqwestStorageHttpClient {
  fn new(request_timeout_ms: Option<u64>) -> ObjectStorageResult<Self> {
    let builder = ReqwestClient::builder()
      .tls_backend_preconfigured(Self::webpki_tls_config()?)
      .timeout(Duration::from_millis(
        request_timeout_ms.unwrap_or(DEFAULT_REQUEST_TIMEOUT_MS),
      ));
    Ok(Self {
      client: builder.build().map_err(ObjectStorageError::HttpClientBuild)?,
    })
  }

  fn webpki_tls_config() -> ObjectStorageResult<rustls::ClientConfig> {
    let roots = RootCertStore {
      roots: webpki_roots::TLS_SERVER_ROOTS.to_vec(),
    };
    Ok(
      rustls::ClientConfig::builder_with_provider(rustls::crypto::aws_lc_rs::default_provider().into())
        .with_safe_default_protocol_versions()
        .map_err(|err| ObjectStorageError::Config(format!("ObjectStorage TLS config failed: {err}")))?
        .with_root_certificates(roots)
        .with_no_client_auth(),
    )
  }

  async fn execute(&self, request: StorageHttpRequest) -> ObjectStorageResult<StorageHttpResponse> {
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

  pub(crate) async fn delete_many(&self, keys: Vec<String>) -> ObjectStorageResult<Vec<ObjectDeleteOutcome>> {
    if keys.is_empty() {
      return Ok(Vec::new());
    }
    if keys.len() > DELETE_OBJECTS_MAX_KEYS {
      return Err(ObjectStorageError::InvalidInput(format!(
        "DeleteObjects supports at most {DELETE_OBJECTS_MAX_KEYS} keys"
      )));
    }

    let mut pending_keys = keys;
    let mut outcomes = Vec::new();
    let mut last_error = None;
    for attempt in 0..DELETE_OBJECTS_MAX_ATTEMPTS {
      match self.delete_many_once(&pending_keys).await {
        Ok(batch_outcomes) => {
          let (retryable, completed) = split_delete_many_outcomes(batch_outcomes);
          outcomes.extend(completed);
          if retryable.is_empty() {
            return Ok(outcomes);
          }
          if attempt + 1 >= DELETE_OBJECTS_MAX_ATTEMPTS {
            outcomes.extend(retryable.into_iter().map(|(key, error)| ObjectDeleteOutcome {
              key,
              error: Some(error),
            }));
            return Ok(outcomes);
          }
          pending_keys = retryable.into_iter().map(|(key, _)| key).collect();
          sleep(Duration::from_millis(delete_objects_backoff_ms(attempt))).await;
        }
        Err(err) if err.is_retryable_http_status() && attempt + 1 < DELETE_OBJECTS_MAX_ATTEMPTS => {
          last_error = Some(err);
          sleep(Duration::from_millis(delete_objects_backoff_ms(attempt))).await;
        }
        Err(err) => return Err(err),
      }
    }

    Err(last_error.unwrap_or_else(|| {
      ObjectStorageError::InvalidInput("DeleteObjects retry exhausted without an error".to_string())
    }))
  }

  async fn delete_many_once(&self, keys: &[String]) -> ObjectStorageResult<Vec<ObjectDeleteOutcome>> {
    let objects = keys
      .iter()
      .map(|key| ObjectIdentifier::new(key.clone()))
      .collect::<Vec<_>>();
    let mut action = DeleteObjects::new(&self.bucket, Some(&self.credentials), objects.iter());
    action.set_quiet(false);
    let (body, content_md5) = action.clone().body_with_md5();
    action.headers_mut().insert("content-md5", content_md5.clone());
    action
      .headers_mut()
      .insert("content-type", "application/xml".to_string());
    action.headers_mut().insert("content-length", body.len().to_string());

    let response = self
      .http
      .execute(StorageHttpRequest {
        method: Method::POST,
        url: action.sign(expires_in(self.presign_expires_in_seconds)),
        headers: HashMap::from([
          ("content-md5".to_string(), content_md5),
          ("content-type".to_string(), "application/xml".to_string()),
          ("content-length".to_string(), body.len().to_string()),
        ]),
        body: Some(body.into_bytes()),
        max_response_body_bytes: MAX_RESPONSE_BODY_BYTES,
      })
      .await
      .map_err(|source| operation_error("ObjectStorage delete many failed", source))?;
    let body = ensure_success_text(response, "ObjectStorage delete many failed".to_string())?;
    let parsed = DeleteObjectsResponse::parse(&body).map_err(|source| ObjectStorageError::InvalidXml {
      context: "ObjectStorage parse delete many response failed".to_string(),
      source,
    })?;
    let mut outcomes = keys
      .iter()
      .map(|key| ObjectDeleteOutcome {
        key: key.clone(),
        error: None,
      })
      .collect::<Vec<_>>();
    for error in parsed.errors {
      if let Some(outcome) = outcomes.iter_mut().find(|outcome| outcome.key == error.key) {
        outcome.error = Some(format!("{}: {}", error.code, error.message));
      }
    }
    Ok(outcomes)
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
  if !(1..=MAX_MULTIPART_PART_NUMBER).contains(&part_number) {
    return Err(ObjectStorageError::InvalidInput(
      "multipart part number must be between 1 and 10000".to_string(),
    ));
  }
  Ok(part_number as u16)
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

fn delete_objects_backoff_ms(attempt: usize) -> u64 {
  DELETE_OBJECTS_BACKOFF_BASE_MS
    .saturating_mul(2_u64.saturating_pow(attempt as u32))
    .min(DELETE_OBJECTS_BACKOFF_MAX_MS)
}

fn is_retryable_delete_objects_error(error: &str) -> bool {
  error.starts_with("SlowDown:")
    || error.starts_with("InternalError:")
    || error.starts_with("ServiceUnavailable:")
    || error.starts_with("RequestTimeout:")
    || error.starts_with("Throttling:")
    || error.starts_with("ThrottlingException:")
    || error.starts_with("TooManyRequests:")
}

fn split_delete_many_outcomes(outcomes: Vec<ObjectDeleteOutcome>) -> (Vec<(String, String)>, Vec<ObjectDeleteOutcome>) {
  let mut retryable = Vec::new();
  let mut completed = Vec::new();
  for outcome in outcomes {
    if let Some(error) = &outcome.error
      && is_retryable_delete_objects_error(error)
    {
      retryable.push((outcome.key, error.clone()));
      continue;
    }
    completed.push(outcome);
  }
  (retryable, completed)
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

#[cfg(test)]
mod tests {
  use reqwest::header::HeaderValue;

  use super::*;

  #[test]
  fn reqwest_storage_http_client_builds_with_webpki_roots() {
    ReqwestStorageHttpClient::new(Some(1_000)).unwrap();
  }

  #[test]
  fn metadata_from_headers_uses_s3_defaults_and_checksum() {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("text/plain"));
    headers.insert(CONTENT_LENGTH, HeaderValue::from_static("42"));
    headers.insert(LAST_MODIFIED, HeaderValue::from_static("Wed, 21 Oct 2015 07:28:00 GMT"));
    headers.insert("x-amz-checksum-crc32", HeaderValue::from_static("checksum"));

    let metadata = metadata_from_headers(&headers);

    assert_eq!(metadata.content_type, "text/plain");
    assert_eq!(metadata.content_length, 42);
    assert_eq!(metadata.last_modified_ms, 1_445_412_480_000);
    assert_eq!(metadata.checksum_crc32.as_deref(), Some("checksum"));

    let defaults = metadata_from_headers(&HeaderMap::new());
    assert_eq!(defaults.content_type, "application/octet-stream");
    assert_eq!(defaults.content_length, 0);
    assert_eq!(defaults.last_modified_ms, 0);
    assert!(defaults.checksum_crc32.is_none());
  }

  #[test]
  fn not_found_body_accepts_object_missing_codes_only() {
    for body in [
      "<Error><Code>NoSuchKey</Code></Error>",
      "<Error><Code>NotFound</Code></Error>",
      "<Error><Code>NoSuchUpload</Code></Error>",
    ] {
      assert!(is_not_found_body(body.as_bytes()), "{body}");
    }
    assert!(!is_not_found_body(b""));
    assert!(!is_not_found_body(b"<Error><Code>AccessDenied</Code></Error>"));
  }

  #[test]
  fn delete_objects_backoff_is_capped() {
    assert_eq!(delete_objects_backoff_ms(0), 1_000);
    assert_eq!(delete_objects_backoff_ms(1), 2_000);
    assert_eq!(delete_objects_backoff_ms(10), 30_000);
  }

  #[test]
  fn delete_objects_outcomes_retry_transient_key_errors_only() {
    let (retryable, completed) = split_delete_many_outcomes(vec![
      ObjectDeleteOutcome {
        key: "slow".to_string(),
        error: Some("SlowDown: reduce your request rate".to_string()),
      },
      ObjectDeleteOutcome {
        key: "internal".to_string(),
        error: Some("InternalError: try again".to_string()),
      },
      ObjectDeleteOutcome {
        key: "denied".to_string(),
        error: Some("AccessDenied: forbidden".to_string()),
      },
      ObjectDeleteOutcome {
        key: "ok".to_string(),
        error: None,
      },
    ]);

    assert_eq!(
      retryable,
      vec![
        ("slow".to_string(), "SlowDown: reduce your request rate".to_string()),
        ("internal".to_string(), "InternalError: try again".to_string())
      ]
    );
    assert_eq!(
      completed,
      vec![
        ObjectDeleteOutcome {
          key: "denied".to_string(),
          error: Some("AccessDenied: forbidden".to_string())
        },
        ObjectDeleteOutcome {
          key: "ok".to_string(),
          error: None
        }
      ]
    );
  }

  #[test]
  fn list_parts_xml_handles_array_single_part_and_pagination() {
    let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Bucket>test</Bucket>
  <Key>key</Key>
  <UploadId>upload-id</UploadId>
  <PartNumberMarker>0</PartNumberMarker>
  <NextPartNumberMarker>3</NextPartNumberMarker>
  <MaxParts>2</MaxParts>
  <IsTruncated>true</IsTruncated>
  <Part>
    <PartNumber>1</PartNumber>
    <LastModified>2010-11-10T20:48:34.000Z</LastModified>
    <ETag>"etag-1"</ETag>
    <Size>10485760</Size>
  </Part>
  <Part>
    <PartNumber>2</PartNumber>
    <LastModified>2010-11-10T20:48:33.000Z</LastModified>
    <ETag>etag-2</ETag>
    <Size>10485760</Size>
  </Part>
</ListPartsResult>"#;
    let parsed = ListParts::parse_response(xml).unwrap();
    let parts = parsed
      .parts
      .into_iter()
      .map(|part| MultipartUploadPart {
        part_number: i32::from(part.number),
        etag: trim_etag(&part.etag),
      })
      .collect::<Vec<_>>();

    assert_eq!(
      parts,
      vec![
        MultipartUploadPart {
          part_number: 1,
          etag: "etag-1".to_string()
        },
        MultipartUploadPart {
          part_number: 2,
          etag: "etag-2".to_string()
        }
      ]
    );
    assert_eq!(parsed.next_part_number_marker, Some(3));

    let single = r#"<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Bucket>test</Bucket>
  <Key>key</Key>
  <UploadId>upload-id</UploadId>
  <MaxParts>1</MaxParts>
  <IsTruncated>false</IsTruncated>
  <Part>
    <PartNumber>5</PartNumber>
    <LastModified>2010-11-10T20:48:34.000Z</LastModified>
    <ETag>"etag-5"</ETag>
    <Size>10485760</Size>
  </Part>
</ListPartsResult>"#;
    let parsed = ListParts::parse_response(single).unwrap();
    assert_eq!(parsed.parts.len(), 1);
    assert_eq!(parsed.parts[0].number, 5);
    assert_eq!(trim_etag(&parsed.parts[0].etag), "etag-5");
    assert_eq!(parsed.next_part_number_marker, None);
  }

  #[test]
  fn complete_multipart_body_orders_and_escapes_parts() {
    let mut parts = completed_multipart_parts(vec![
      MultipartUploadPart {
        part_number: 2,
        etag: "b&c".to_string(),
      },
      MultipartUploadPart {
        part_number: 1,
        etag: "a<tag>".to_string(),
      },
    ]);
    validate_completed_parts(&parts).unwrap();

    let body = complete_multipart_body(&parts);

    assert_eq!(
      body,
      "<CompleteMultipartUpload><Part><ETag>a&lt;tag&gt;</ETag><PartNumber>1</PartNumber></Part><Part><ETag>b&amp;c</\
       ETag><PartNumber>2</PartNumber></Part></CompleteMultipartUpload>"
    );

    parts[0].etag.clear();
    assert!(validate_completed_parts(&parts).is_err());
    assert!(
      validate_completed_parts(&[MultipartUploadPart {
        part_number: -1,
        etag: "etag".to_string(),
      }])
      .is_err()
    );
    assert!(
      validate_completed_parts(&[MultipartUploadPart {
        part_number: 0,
        etag: "etag".to_string(),
      }])
      .is_err()
    );
    assert!(
      validate_completed_parts(&[MultipartUploadPart {
        part_number: 10_001,
        etag: "etag".to_string(),
      }])
      .is_err()
    );
  }

  #[test]
  fn parse_rfc3339_ms_returns_zero_for_invalid_values() {
    assert_eq!(parse_rfc3339_ms("2024-01-02T03:04:05Z"), 1_704_164_645_000);
    assert_eq!(parse_rfc3339_ms("not a date"), 0);
  }
}
