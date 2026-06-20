use std::collections::HashMap;

use aws_sdk_s3::types::CompletedPart;
use napi::Result;
use serde::Deserialize;

use crate::backend_runtime::{
  error::napi_error,
  types::{
    RuntimeMultipartUploadInit, RuntimeMultipartUploadPart, RuntimeObjectGetResult, RuntimeObjectListEntry,
    RuntimeObjectMetadata, RuntimeObjectStoragePutOptions, RuntimePresignedObjectRequest,
  },
};

#[derive(Clone, Debug, Default)]
pub(super) struct ObjectPutMetadata {
  pub(super) content_type: Option<String>,
  pub(super) content_length: Option<i64>,
  pub(super) checksum_crc32: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct ObjectMetadata {
  pub(super) content_type: String,
  pub(super) content_length: i64,
  pub(super) last_modified_ms: i64,
  pub(super) checksum_crc32: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct ObjectListEntry {
  pub(super) key: String,
  pub(super) content_length: i64,
  pub(super) last_modified_ms: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct ObjectGetResult {
  pub(super) body: Vec<u8>,
  pub(super) metadata: ObjectMetadata,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct PresignedObjectRequest {
  pub(super) url: String,
  pub(super) headers: HashMap<String, String>,
  pub(super) expires_at_ms: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct MultipartUploadInitResult {
  pub(super) upload_id: String,
  pub(super) expires_at_ms: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct MultipartUploadPart {
  pub(super) part_number: i32,
  pub(super) etag: String,
}

#[derive(Clone, Debug, Deserialize)]
pub(in crate::backend_runtime) struct StorageProviderConfig {
  pub(super) provider: String,
  pub(super) bucket: String,
  #[serde(default)]
  pub(super) config: serde_json::Value,
}

pub(super) fn trim_etag(etag: &str) -> String {
  etag.trim_matches('"').to_string()
}

pub(super) fn completed_multipart_parts(mut parts: Vec<MultipartUploadPart>) -> Vec<CompletedPart> {
  parts.sort_by_key(|part| part.part_number);
  parts
    .into_iter()
    .map(|part| {
      CompletedPart::builder()
        .part_number(part.part_number)
        .e_tag(part.etag)
        .build()
    })
    .collect()
}

impl From<RuntimeObjectStoragePutOptions> for ObjectPutMetadata {
  fn from(options: RuntimeObjectStoragePutOptions) -> Self {
    Self {
      content_type: options.content_type,
      content_length: options.content_length,
      checksum_crc32: options.checksum_crc32,
    }
  }
}

impl From<ObjectMetadata> for RuntimeObjectMetadata {
  fn from(metadata: ObjectMetadata) -> Self {
    Self {
      content_type: metadata.content_type,
      content_length: metadata.content_length,
      last_modified_ms: metadata.last_modified_ms,
      checksum_crc32: metadata.checksum_crc32,
    }
  }
}

impl From<ObjectListEntry> for RuntimeObjectListEntry {
  fn from(entry: ObjectListEntry) -> Self {
    Self {
      key: entry.key,
      content_length: entry.content_length,
      last_modified_ms: entry.last_modified_ms,
    }
  }
}

impl TryFrom<PresignedObjectRequest> for RuntimePresignedObjectRequest {
  type Error = napi::Error;

  fn try_from(request: PresignedObjectRequest) -> Result<Self> {
    Ok(Self {
      url: request.url,
      headers_json: serde_json::to_string(&request.headers)
        .map_err(|err| napi_error(format!("ObjectStorage headers serialization failed: {err}")))?,
      expires_at_ms: request.expires_at_ms,
    })
  }
}

impl From<ObjectGetResult> for RuntimeObjectGetResult {
  fn from(result: ObjectGetResult) -> Self {
    Self {
      body: result.body.into(),
      metadata: result.metadata.into(),
    }
  }
}

impl From<MultipartUploadInitResult> for RuntimeMultipartUploadInit {
  fn from(init: MultipartUploadInitResult) -> Self {
    Self {
      upload_id: init.upload_id,
      expires_at_ms: init.expires_at_ms,
    }
  }
}

impl From<RuntimeMultipartUploadPart> for MultipartUploadPart {
  fn from(part: RuntimeMultipartUploadPart) -> Self {
    Self {
      part_number: part.part_number,
      etag: part.etag,
    }
  }
}

impl From<MultipartUploadPart> for RuntimeMultipartUploadPart {
  fn from(part: MultipartUploadPart) -> Self {
    Self {
      part_number: part.part_number,
      etag: part.etag,
    }
  }
}
