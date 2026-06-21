use napi::bindgen_prelude::Buffer;

#[napi_derive::napi(object)]
pub struct RuntimeVerificationTokenRecord {
  pub token_type: i32,
  pub token: String,
  pub credential: Option<String>,
  pub expires_at_ms: i64,
}

#[napi_derive::napi(object)]
pub struct BackendRuntimeHealth {
  pub started: bool,
  pub database_connected: bool,
  pub object_storage_configured: bool,
}

#[napi_derive::napi(object)]
pub struct RuntimeObjectStorageHealth {
  pub configured: bool,
  pub provider: Option<String>,
  pub bucket: Option<String>,
  pub endpoint: Option<String>,
  pub region: Option<String>,
  pub has_credentials: bool,
  pub force_path_style: bool,
  pub request_timeout_ms: Option<i64>,
  pub min_part_size: Option<i64>,
  pub presign_expires_in_seconds: Option<i64>,
  pub presign_sign_content_type_for_put: Option<bool>,
  pub use_presigned_url: bool,
  pub client_buildable: bool,
}

#[napi_derive::napi(object)]
pub struct CoordinationLeaseGrant {
  pub key: String,
  pub owner: String,
  #[napi(ts_type = "bigint | number")]
  pub fencing_token: i64,
}

#[napi_derive::napi(object)]
pub struct RuntimeMagicLinkOtpConsumeResult {
  pub ok: bool,
  pub token: Option<String>,
  pub reason: Option<String>,
}

#[napi_derive::napi(object)]
pub struct RuntimeWorkspaceInviteLinkRecord {
  pub workspace_id: String,
  pub invite_id: String,
  pub inviter_user_id: String,
  pub expires_at_ms: i64,
}

#[napi_derive::napi(object)]
pub struct RuntimeByokLocalLeaseRecord {
  pub lease_id: String,
  pub payload: serde_json::Value,
  pub expires_at_ms: i64,
}

#[napi_derive::napi(object)]
pub struct RuntimeDocHistoryInput {
  pub workspace_id: String,
  pub doc_id: String,
  pub blob: Buffer,
  pub timestamp_ms: i64,
  pub editor_id: Option<String>,
  pub force: bool,
  pub history_min_interval_ms: i64,
  pub history_max_age_ms: i64,
}

#[napi_derive::napi(object)]
pub struct RuntimeObjectStoragePutOptions {
  pub content_type: Option<String>,
  pub content_length: Option<i64>,
  pub checksum_crc32: Option<String>,
}

#[napi_derive::napi(object)]
pub struct RuntimeObjectMetadata {
  pub content_type: String,
  pub content_length: i64,
  pub last_modified_ms: i64,
  pub checksum_crc32: Option<String>,
}

#[napi_derive::napi(object)]
pub struct RuntimeObjectListEntry {
  pub key: String,
  pub content_length: i64,
  pub last_modified_ms: i64,
}

#[napi_derive::napi(object)]
pub struct RuntimeObjectGetResult {
  pub body: Buffer,
  pub metadata: RuntimeObjectMetadata,
}

#[napi_derive::napi(object)]
pub struct RuntimePresignedObjectRequest {
  pub url: String,
  pub headers_json: String,
  pub expires_at_ms: i64,
}

#[napi_derive::napi(object)]
pub struct RuntimeMultipartUploadInit {
  pub upload_id: String,
  pub expires_at_ms: i64,
}

#[napi_derive::napi(object)]
pub struct RuntimeMultipartUploadPart {
  pub part_number: i32,
  pub etag: String,
}

#[napi_derive::napi(object)]
pub struct RuntimeBlobCleanupResult {
  pub scanned: i64,
  pub deleted: i64,
  pub aborted_multipart: i64,
  pub workspace_ids: Vec<String>,
}

#[napi_derive::napi(object)]
pub struct RuntimeBlobCompleteResult {
  pub ok: bool,
  pub reason: Option<String>,
  pub content_type: Option<String>,
  pub content_length: Option<i64>,
  pub last_modified_ms: Option<i64>,
}

#[napi_derive::napi(object)]
pub struct RuntimeDocCompactionResult {
  pub lease_acquired: bool,
  pub merged: bool,
  pub workspace_id: String,
  pub doc_id: String,
  pub updates_merged: i64,
  pub history_created: bool,
}

#[napi_derive::napi(object)]
pub struct RuntimeWorkspaceStatsRefreshResult {
  pub processed: i64,
  pub backlog: i64,
  pub skipped: bool,
}

#[napi_derive::napi(object)]
pub struct RuntimeWorkspaceStatsRecalibrationResult {
  pub processed: i64,
  pub last_sid: i64,
  pub skipped: bool,
}

#[napi_derive::napi(object)]
pub struct RuntimeWorkspaceStatsSnapshotResult {
  pub snapshotted: i64,
  pub skipped: bool,
}

#[napi_derive::napi(object)]
pub struct RuntimeWorkspaceStatsDailyRecalibrationResult {
  pub processed: i64,
  pub last_sid: i64,
  pub snapshotted: i64,
  pub skipped: bool,
}
