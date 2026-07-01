use std::collections::HashMap;

use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::Deserialize;

use super::super::{
  RuntimeError, RuntimeMultipartUploadInit, RuntimeMultipartUploadPart, RuntimeObjectGetResult, RuntimeObjectListEntry,
  RuntimeObjectMetadata, RuntimeObjectStoragePutOptions, RuntimePresignedObjectRequest, RuntimeResult,
};

#[derive(Clone, Debug, Default)]
pub(crate) struct ObjectPutMetadata {
  pub(crate) content_type: Option<String>,
  pub(crate) content_length: Option<i64>,
  pub(crate) checksum_crc32: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ObjectMetadata {
  pub(crate) content_type: String,
  pub(crate) content_length: i64,
  pub(crate) last_modified_ms: i64,
  pub(crate) checksum_crc32: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ObjectListEntry {
  pub(crate) key: String,
  pub(crate) content_length: i64,
  pub(crate) last_modified_ms: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ObjectListPage {
  pub(crate) entries: Vec<ObjectListEntry>,
  pub(crate) next_continuation_token: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ObjectDeleteOutcome {
  pub(crate) key: String,
  pub(crate) error: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ObjectGetResult {
  pub(crate) body: Vec<u8>,
  pub(crate) metadata: ObjectMetadata,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct PresignedObjectRequest {
  pub(crate) url: String,
  pub(crate) headers: HashMap<String, String>,
  pub(crate) expires_at_ms: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct MultipartUploadInitResult {
  pub(crate) upload_id: String,
  pub(crate) expires_at_ms: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct MultipartUploadPart {
  pub(crate) part_number: i32,
  pub(crate) etag: String,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct StorageProviderConfig {
  pub(crate) provider: String,
  pub(crate) bucket: String,
  #[serde(default)]
  pub(crate) config: serde_json::Value,
}

pub(crate) fn trim_etag(etag: &str) -> String {
  etag.trim_matches('"').to_string()
}

pub(crate) fn completed_multipart_parts(mut parts: Vec<MultipartUploadPart>) -> Vec<MultipartUploadPart> {
  parts.sort_by_key(|part| part.part_number);
  parts
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

impl ObjectPutMetadata {
  pub(crate) fn complete_for_body(mut self, body: &[u8]) -> Self {
    self.content_length.get_or_insert(body.len() as i64);
    self.checksum_crc32.get_or_insert_with(|| checksum_crc32_base64(body));
    self
      .content_type
      .get_or_insert_with(|| crate::file_type::get_mime(body));
    self
  }

  pub(crate) fn into_object_metadata(self, last_modified_ms: i64) -> ObjectMetadata {
    ObjectMetadata {
      content_type: self
        .content_type
        .unwrap_or_else(|| "application/octet-stream".to_string()),
      content_length: self.content_length.unwrap_or(0),
      last_modified_ms,
      checksum_crc32: self.checksum_crc32,
    }
  }
}

pub(crate) fn checksum_crc32_base64(body: &[u8]) -> String {
  STANDARD.encode(crc32fast::hash(body).to_be_bytes())
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
  type Error = RuntimeError;

  fn try_from(request: PresignedObjectRequest) -> RuntimeResult<Self> {
    Ok(Self {
      url: request.url,
      headers_json: serde_json::to_string(&request.headers)
        .map_err(|err| RuntimeError::json("ObjectStorage headers serialization failed", err))?,
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
