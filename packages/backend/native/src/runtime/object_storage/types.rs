use std::collections::HashMap;

use base64::{
  Engine as _,
  engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
};
use serde::Deserialize;

use super::error::{ObjectStorageError, ObjectStorageResult};
use crate::runtime::{
  RuntimeError, RuntimeResult,
  types::{
    RuntimeMultipartUploadInit, RuntimeMultipartUploadPart, RuntimeObjectGetResult, RuntimeObjectListEntry,
    RuntimeObjectMetadata, RuntimeObjectStoragePutOptions, RuntimePresignedObjectRequest,
  },
};

const MAX_ID_SEGMENT_LEN: usize = 64;

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub(crate) struct ObjectKey(String);

impl ObjectKey {
  pub(crate) fn new(value: impl Into<String>) -> ObjectStorageResult<Self> {
    let value = value.into();
    validate_object_path(&value, false)?;
    Ok(Self(value))
  }

  pub(crate) fn as_str(&self) -> &str {
    &self.0
  }

  pub(crate) fn into_string(self) -> String {
    self.0
  }
}

impl AsRef<str> for ObjectKey {
  fn as_ref(&self) -> &str {
    self.as_str()
  }
}

impl std::ops::Deref for ObjectKey {
  type Target = str;

  fn deref(&self) -> &Self::Target {
    self.as_str()
  }
}

impl std::fmt::Display for ObjectKey {
  fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    formatter.write_str(self.as_str())
  }
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub(crate) struct ObjectPrefix(String);

impl ObjectPrefix {
  pub(crate) fn new(value: impl Into<String>) -> ObjectStorageResult<Self> {
    let value = value.into();
    validate_object_path(&value, true)?;
    Ok(Self(value))
  }

  pub(crate) fn as_str(&self) -> &str {
    &self.0
  }

  pub(crate) fn into_string(self) -> String {
    self.0
  }
}

impl std::ops::Deref for ObjectPrefix {
  type Target = str;

  fn deref(&self) -> &Self::Target {
    self.as_str()
  }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(crate) enum StorageScope {
  Avatar,
  Blob,
  Copilot,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ObjectLocator {
  pub(crate) scope: StorageScope,
  pub(crate) key: ObjectKey,
}

impl ObjectLocator {
  pub(crate) fn new(scope: StorageScope, key: ObjectKey) -> Self {
    Self { scope, key }
  }

  pub(crate) fn new_writer(scope: &str, key: String) -> RuntimeResult<ObjectLocator> {
    let scope = StorageScope::parse(scope)?;
    let key = ObjectKey::new(key)?;
    validate_scoped_write_key(scope, &key)?;

    Ok(Self { scope, key })
  }
}

impl StorageScope {
  pub(crate) fn parse(value: &str) -> ObjectStorageResult<Self> {
    match value {
      "avatar" => Ok(Self::Avatar),
      "blob" => Ok(Self::Blob),
      "copilot" => Ok(Self::Copilot),
      _ => Err(ObjectStorageError::InvalidInput("unknown storage scope".to_string())),
    }
  }

  pub(crate) fn as_str(self) -> &'static str {
    match self {
      Self::Avatar => "avatar",
      Self::Blob => "blob",
      Self::Copilot => "copilot",
    }
  }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct WorkspaceBlobKey(ObjectKey);

impl WorkspaceBlobKey {
  pub(crate) fn new(workspace_id: &str, blob_id: &str) -> ObjectStorageResult<Self> {
    validate_single_segment(workspace_id, "workspace id")?;
    if !is_sha256_base64url(blob_id) {
      return Err(ObjectStorageError::InvalidInput(
        "workspace blob id must be canonical SHA-256 base64url".to_string(),
      ));
    }
    ObjectKey::new(format!("{workspace_id}/{blob_id}")).map(Self)
  }

  pub(crate) fn into_object_key(self) -> ObjectKey {
    self.0
  }
}

pub(super) fn validate_scoped_write_key(scope: StorageScope, key: &str) -> ObjectStorageResult<()> {
  let valid = match scope {
    StorageScope::Blob => validate_blob_key(key),
    StorageScope::Copilot => validate_copilot_key(key),
    StorageScope::Avatar => validate_avatar_key(key),
  };
  if valid {
    Ok(())
  } else {
    Err(ObjectStorageError::InvalidInput(format!(
      "invalid {} object key",
      scope.as_str()
    )))
  }
}

fn validate_blob_key(key: &str) -> bool {
  let segments: Vec<&str> = key.split('/').collect();
  match segments.as_slice() {
    // Existing workspaces may contain blob identifiers created before canonical
    // content hashes were required. New uploads still use WorkspaceBlobKey.
    [workspace_id, blob_id] => {
      is_id_segment(workspace_id) && validate_single_segment(blob_id, "workspace blob id").is_ok()
    }
    // comment attachment: comment-attachments/<workspaceId>/<docId>/<uuid>
    ["comment-attachments", workspace_id, doc_id, attachment_key] => {
      [workspace_id, doc_id, attachment_key].iter().all(|s| is_id_segment(s))
    }
    _ => false,
  }
}

fn validate_copilot_key(key: &str) -> bool {
  let segments: Vec<&str> = key.split('/').collect();
  match segments.as_slice() {
    // chat attachments, generated images, transcript slices:
    // <userId>/<workspaceId>/<sha256b64>[-<index>]
    [user_id, workspace_id, hash] => is_id_segment(user_id) && is_id_segment(workspace_id) && is_hash_or_slice(hash),
    // embedding workspace file: workspace-files/<workspaceId>/<fileId>/<sha256b64>
    ["workspace-files", workspace_id, file_id, hash] => {
      is_id_segment(workspace_id) && is_id_segment(file_id) && is_sha256_base64url(hash)
    }
    // embedding context file:
    // context-files/<workspaceId>/<sessionId>/<fileId>/<sha256b64>
    ["context-files", workspace_id, session_id, file_id, hash] => {
      [workspace_id, session_id, file_id].iter().all(|s| is_id_segment(s)) && is_sha256_base64url(hash)
    }
    _ => false,
  }
}

/// avatar: <userId>-avatar-<timestamp millis>, single segment.
fn validate_avatar_key(key: &str) -> bool {
  if key.contains('/') {
    return false;
  }
  let Some((user_id, timestamp)) = key.rsplit_once("-avatar-") else {
    return false;
  };
  is_id_segment(user_id) && is_digits(timestamp)
}

fn validate_object_path(value: &str, prefix: bool) -> ObjectStorageResult<()> {
  if prefix && value.is_empty() {
    return Ok(());
  }
  if value.is_empty() || value.starts_with('/') || (!prefix && value.ends_with('/')) {
    return Err(ObjectStorageError::InvalidInput("invalid object key".to_string()));
  }
  let path = if prefix {
    value.strip_suffix('/').unwrap_or(value)
  } else {
    value
  };
  if path.is_empty()
    || value.contains('\\')
    || value.contains('%')
    || value.chars().any(char::is_control)
    || path
      .split('/')
      .any(|segment| segment.is_empty() || matches!(segment, "." | ".."))
  {
    return Err(ObjectStorageError::InvalidInput("invalid object key".to_string()));
  }
  Ok(())
}

fn validate_single_segment(value: &str, field: &str) -> ObjectStorageResult<()> {
  if value.is_empty()
    || value.contains('/')
    || value.contains('\\')
    || value.contains('%')
    || value.chars().any(char::is_control)
    || matches!(value, "." | "..")
  {
    return Err(ObjectStorageError::InvalidInput(format!("invalid {field}")));
  }
  Ok(())
}

pub(super) fn is_sha256_base64url(value: &str) -> bool {
  let unpadded = value.strip_suffix('=').unwrap_or(value);
  if !(value.len() == 43 || value.len() == 44 && value.ends_with('=')) || unpadded.len() != 43 {
    return false;
  }
  URL_SAFE_NO_PAD
    .decode(unpadded)
    .is_ok_and(|decoded| decoded.len() == 32 && URL_SAFE_NO_PAD.encode(decoded) == unpadded)
}

/// uuid, nanoid and similar server/client generated identifiers.
fn is_id_segment(value: &str) -> bool {
  !value.is_empty()
    && value.len() <= MAX_ID_SEGMENT_LEN
    && value
      .bytes()
      .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn is_digits(value: &str) -> bool {
  !value.is_empty() && value.bytes().all(|b| b.is_ascii_digit())
}

/// Plain content hash, or a transcript slice key `<sha256b64>-<index>`.
fn is_hash_or_slice(value: &str) -> bool {
  if !value.is_ascii() {
    return false;
  }
  if is_sha256_base64url(value) {
    return true;
  }
  // The blob id may carry `=` padding, so try both hash lengths.
  for hash_len in [44, 43] {
    if value.len() > hash_len + 1 {
      let (head, rest) = value.split_at(hash_len);
      if let Some(index) = rest.strip_prefix('-')
        && is_sha256_base64url(head)
        && is_digits(index)
      {
        return true;
      }
    }
  }
  false
}

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
