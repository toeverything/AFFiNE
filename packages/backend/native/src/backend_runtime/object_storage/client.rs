use std::{
  collections::HashMap,
  time::{Duration, SystemTime, UNIX_EPOCH},
};

use aws_sdk_s3::{
  Client as S3Client, presigning::PresigningConfig, primitives::ByteStream, types::CompletedMultipartUpload,
};
use napi::Result;

use super::types::{
  MultipartUploadInitResult, MultipartUploadPart, ObjectGetResult, ObjectListEntry, ObjectMetadata, ObjectPutMetadata,
  PresignedObjectRequest, completed_multipart_parts, trim_etag,
};
use crate::backend_runtime::error::napi_error;

#[derive(Clone)]
pub(super) struct ObjectStorageClient {
  client: S3Client,
  bucket: String,
  presign_expires_in_seconds: u64,
  presign_sign_content_type_for_put: bool,
}

impl ObjectStorageClient {
  pub(super) fn new(
    config: aws_sdk_s3::Config,
    bucket: String,
    presign_expires_in_seconds: u64,
    presign_sign_content_type_for_put: bool,
  ) -> Self {
    Self {
      client: S3Client::from_conf(config),
      bucket,
      presign_expires_in_seconds,
      presign_sign_content_type_for_put,
    }
  }

  pub(super) fn non_destructive_health(&self) -> bool {
    let _ = &self.client;
    !self.bucket.is_empty()
  }

  pub(super) async fn put(&self, key: &str, body: Vec<u8>, metadata: ObjectPutMetadata) -> Result<()> {
    let content_length = metadata.content_length.unwrap_or(body.len() as i64);
    let content_type = metadata
      .content_type
      .unwrap_or_else(|| "application/octet-stream".to_string());

    let mut request = self
      .client
      .put_object()
      .bucket(&self.bucket)
      .key(key)
      .body(ByteStream::from(body))
      .content_type(content_type)
      .content_length(content_length);

    if let Some(checksum) = metadata.checksum_crc32 {
      request = request.checksum_crc32(checksum);
    }

    request
      .send()
      .await
      .map_err(|err| napi_error(format!("ObjectStorage put failed for {key}: {err:?}")))?;
    Ok(())
  }

  pub(super) async fn presign_put(&self, key: &str, metadata: ObjectPutMetadata) -> Result<PresignedObjectRequest> {
    let content_type = metadata
      .content_type
      .unwrap_or_else(|| "application/octet-stream".to_string());
    let expires_at_ms = expires_at_ms(self.presign_expires_in_seconds)?;
    let config = PresigningConfig::expires_in(Duration::from_secs(self.presign_expires_in_seconds))
      .map_err(|err| napi_error(format!("ObjectStorage presign config failed: {err}")))?;

    let mut request = self.client.put_object().bucket(&self.bucket).key(key);
    if self.presign_sign_content_type_for_put {
      request = request.content_type(content_type.clone());
    }
    if let Some(content_length) = metadata.content_length {
      request = request.content_length(content_length);
    }

    let presigned = request
      .presigned(config)
      .await
      .map_err(|err| napi_error(format!("ObjectStorage presign put failed for {key}: {err}")))?;
    let mut headers = presigned_headers(&presigned);
    headers.insert("Content-Type".to_string(), content_type);

    Ok(PresignedObjectRequest {
      url: presigned.uri().to_string(),
      headers,
      expires_at_ms,
    })
  }

  pub(super) async fn create_multipart_upload(
    &self,
    key: &str,
    metadata: ObjectPutMetadata,
  ) -> Result<Option<MultipartUploadInitResult>> {
    let content_type = metadata
      .content_type
      .unwrap_or_else(|| "application/octet-stream".to_string());
    let result = self
      .client
      .create_multipart_upload()
      .bucket(&self.bucket)
      .key(key)
      .content_type(content_type)
      .send()
      .await
      .map_err(|err| {
        napi_error(format!(
          "ObjectStorage create multipart upload failed for {key}: {err:?}"
        ))
      })?;

    let expires_at_ms = expires_at_ms(self.presign_expires_in_seconds)?;
    Ok(result.upload_id.map(|upload_id| MultipartUploadInitResult {
      upload_id,
      expires_at_ms,
    }))
  }

  pub(super) async fn presign_upload_part(
    &self,
    key: &str,
    upload_id: &str,
    part_number: i32,
  ) -> Result<PresignedObjectRequest> {
    let expires_at_ms = expires_at_ms(self.presign_expires_in_seconds)?;
    let config = PresigningConfig::expires_in(Duration::from_secs(self.presign_expires_in_seconds))
      .map_err(|err| napi_error(format!("ObjectStorage presign config failed: {err}")))?;
    let presigned = self
      .client
      .upload_part()
      .bucket(&self.bucket)
      .key(key)
      .upload_id(upload_id)
      .part_number(part_number)
      .presigned(config)
      .await
      .map_err(|err| napi_error(format!("ObjectStorage presign upload part failed for {key}: {err}")))?;

    Ok(PresignedObjectRequest {
      url: presigned.uri().to_string(),
      headers: presigned_headers(&presigned),
      expires_at_ms,
    })
  }

  pub(super) async fn list_multipart_upload_parts(
    &self,
    key: &str,
    upload_id: &str,
  ) -> Result<Vec<MultipartUploadPart>> {
    let result = self
      .client
      .list_parts()
      .bucket(&self.bucket)
      .key(key)
      .upload_id(upload_id)
      .send()
      .await
      .map_err(|err| {
        napi_error(format!(
          "ObjectStorage list multipart upload parts failed for {key}: {err}"
        ))
      })?;

    Ok(
      result
        .parts()
        .iter()
        .filter_map(|part| {
          Some(MultipartUploadPart {
            part_number: part.part_number?,
            etag: trim_etag(part.e_tag.as_deref().unwrap_or_default()),
          })
        })
        .collect(),
    )
  }

  pub(super) async fn complete_multipart_upload(
    &self,
    key: &str,
    upload_id: &str,
    parts: Vec<MultipartUploadPart>,
  ) -> Result<()> {
    let ordered_parts = completed_multipart_parts(parts);
    self
      .client
      .complete_multipart_upload()
      .bucket(&self.bucket)
      .key(key)
      .upload_id(upload_id)
      .multipart_upload(
        CompletedMultipartUpload::builder()
          .set_parts(Some(ordered_parts))
          .build(),
      )
      .send()
      .await
      .map_err(|err| {
        napi_error(format!(
          "ObjectStorage complete multipart upload failed for {key}: {err}"
        ))
      })?;
    Ok(())
  }

  pub(super) async fn abort_multipart_upload(&self, key: &str, upload_id: &str) -> Result<()> {
    self
      .client
      .abort_multipart_upload()
      .bucket(&self.bucket)
      .key(key)
      .upload_id(upload_id)
      .send()
      .await
      .map_err(|err| {
        napi_error(format!(
          "ObjectStorage abort multipart upload failed for {key}: {err:?}"
        ))
      })?;
    Ok(())
  }

  pub(super) async fn head(&self, key: &str) -> Result<Option<ObjectMetadata>> {
    let result = self
      .client
      .head_object()
      .bucket(&self.bucket)
      .key(key)
      .send()
      .await
      .map_err(|err| napi_error(format!("ObjectStorage head failed for {key}: {err:?}")))?;

    Ok(Some(ObjectMetadata {
      content_type: result
        .content_type
        .unwrap_or_else(|| "application/octet-stream".to_string()),
      content_length: result.content_length.unwrap_or(0),
      last_modified_ms: optional_datetime_ms(result.last_modified),
      checksum_crc32: result.checksum_crc32,
    }))
  }

  pub(super) async fn get(&self, key: &str) -> Result<Option<ObjectGetResult>> {
    let result = self
      .client
      .get_object()
      .bucket(&self.bucket)
      .key(key)
      .send()
      .await
      .map_err(|err| napi_error(format!("ObjectStorage get failed for {key}: {err:?}")))?;
    let metadata = ObjectMetadata {
      content_type: result
        .content_type
        .unwrap_or_else(|| "application/octet-stream".to_string()),
      content_length: result.content_length.unwrap_or(0),
      last_modified_ms: optional_datetime_ms(result.last_modified),
      checksum_crc32: result.checksum_crc32,
    };
    let body = result
      .body
      .collect()
      .await
      .map_err(|err| napi_error(format!("ObjectStorage read body failed for {key}: {err}")))?
      .into_bytes()
      .to_vec();

    Ok(Some(ObjectGetResult { body, metadata }))
  }

  pub(super) async fn list(&self, prefix: Option<String>) -> Result<Vec<ObjectListEntry>> {
    let mut entries = Vec::new();
    let mut token = None;
    loop {
      let mut request = self.client.list_objects_v2().bucket(&self.bucket);
      if let Some(prefix) = &prefix {
        request = request.prefix(prefix);
      }
      if let Some(next_token) = token {
        request = request.continuation_token(next_token);
      }
      let result = request
        .send()
        .await
        .map_err(|err| napi_error(format!("ObjectStorage list failed: {err:?}")))?;

      entries.extend(result.contents().iter().filter_map(|object| {
        Some(ObjectListEntry {
          key: object.key.as_ref()?.clone(),
          content_length: object.size.unwrap_or(0),
          last_modified_ms: optional_datetime_ms(object.last_modified),
        })
      }));

      if result.is_truncated.unwrap_or(false) {
        token = result.next_continuation_token;
      } else {
        break;
      }
    }

    Ok(entries)
  }

  pub(super) async fn delete(&self, key: &str) -> Result<()> {
    self
      .client
      .delete_object()
      .bucket(&self.bucket)
      .key(key)
      .send()
      .await
      .map_err(|err| napi_error(format!("ObjectStorage delete failed for {key}: {err:?}")))?;
    Ok(())
  }
}

fn expires_at_ms(expires_in_seconds: u64) -> Result<i64> {
  let expires_at = SystemTime::now()
    .checked_add(Duration::from_secs(expires_in_seconds))
    .ok_or_else(|| napi_error("ObjectStorage presign expiration overflow"))?;
  system_time_ms(expires_at)
}

fn system_time_ms(time: SystemTime) -> Result<i64> {
  let duration = time
    .duration_since(UNIX_EPOCH)
    .map_err(|err| napi_error(format!("system time before unix epoch: {err}")))?;
  Ok(duration.as_millis() as i64)
}

fn optional_datetime_ms(time: Option<aws_sdk_s3::primitives::DateTime>) -> i64 {
  time.and_then(|value| value.to_millis().ok()).unwrap_or(0)
}

fn presigned_headers(request: &aws_sdk_s3::presigning::PresignedRequest) -> HashMap<String, String> {
  request
    .headers()
    .map(|(key, value)| (key.to_string(), value.to_string()))
    .collect()
}
