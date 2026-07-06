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
}

#[napi_derive::napi(object)]
pub struct RuntimeQuotaTargetDomainInput {
  pub domain: String,
  pub count: i32,
}

#[napi_derive::napi(object)]
pub struct RuntimeQuotaSourceInput {
  pub trusted: bool,
  pub ip: Option<String>,
  pub country: Option<String>,
  pub asn: Option<u32>,
  pub ray_id: Option<String>,
}

#[napi_derive::napi(object)]
pub struct RuntimeWorkspaceInviteQuotaInput {
  pub actor_user_id: String,
  pub workspace_id: String,
  pub request_id: Option<String>,
  pub target_count: i32,
  pub target_domains: Vec<RuntimeQuotaTargetDomainInput>,
  pub source: Option<RuntimeQuotaSourceInput>,
}

#[napi_derive::napi(object)]
pub struct RuntimeWorkspaceInviteQuotaUsage {
  pub target_count: i32,
  pub target_domains: Vec<RuntimeQuotaTargetDomainInput>,
}

#[napi_derive::napi(object)]
pub struct RuntimeInviteAbuseActionRequired {
  pub action: String,
  pub subject_key: String,
  pub evidence_id: String,
  pub action_id: String,
}

#[napi_derive::napi(object)]
pub struct RuntimeInviteAbuseClaimedAction {
  pub action: String,
  pub subject_key: String,
  pub evidence_id: String,
  pub action_id: String,
  pub actor_user_id: String,
  pub workspace_id: String,
}

#[napi_derive::napi(object)]
pub struct RuntimeWorkspaceInviteQuotaDecision {
  pub allowed: bool,
  pub reservation_id: Option<String>,
  pub retry_after_seconds: Option<i32>,
  pub reason: Option<String>,
  pub scope_key: Option<String>,
  pub window_seconds: Option<i32>,
  pub limit: Option<i32>,
  pub current: Option<i32>,
  pub requested: Option<i32>,
  pub action_required: Option<RuntimeInviteAbuseActionRequired>,
}

#[napi_derive::napi(object)]
pub struct RuntimeMailDeliveryQuotaMetadataInput {
  pub actor_user_id: Option<String>,
  pub workspace_id: Option<String>,
  pub notification_id: Option<String>,
  pub abuse_subject_key: Option<String>,
}

#[napi_derive::napi(object)]
pub struct RuntimeMailDeliveryQuotaRecipientInput {
  pub email: String,
  pub domain: String,
  pub user_id: Option<String>,
}

#[napi_derive::napi(object)]
pub struct RuntimeMailDeliveryQuotaInput {
  pub request_id: Option<String>,
  pub mail_name: String,
  pub recipient: RuntimeMailDeliveryQuotaRecipientInput,
  pub metadata: RuntimeMailDeliveryQuotaMetadataInput,
  pub source: Option<RuntimeQuotaSourceInput>,
}

#[napi_derive::napi(object)]
pub struct RuntimeMailDeliveryQuotaDecision {
  pub allowed: bool,
  pub reservation_id: Option<String>,
  pub mail_class: String,
  pub retry_after_seconds: Option<i32>,
  pub reason: Option<String>,
  pub scope_key: Option<String>,
  pub window_seconds: Option<i32>,
  pub limit: Option<i32>,
  pub current: Option<i32>,
  pub requested: Option<i32>,
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
pub struct RuntimeBlobMetadataBackfillResult {
  pub scanned_objects: i64,
  pub headed_objects: i64,
  pub upserted_metadata: i64,
  pub skipped_existing: i64,
  pub skipped_workspace_missing: i64,
  pub failed: i64,
  pub next_cursor: Option<String>,
  pub workspace_ids: Vec<String>,
}

#[napi_derive::napi(object)]
pub struct RuntimeDocBlobRefsResult {
  pub scanned_docs: i64,
  pub parsed_docs: i64,
  pub refs_written: i64,
  pub refs_deleted: i64,
  pub failed_docs: i64,
  pub next_cursor: Option<String>,
}

#[napi_derive::napi(object)]
pub struct RuntimeBlobCleanupPlanResult {
  pub run_id: Option<String>,
  pub scanned_blobs: i64,
  pub candidates_marked: i64,
  pub protected_by_doc_refs: i64,
  pub protected_by_metadata: i64,
  pub protected_by_other_refs: i64,
  pub next_cursor: Option<String>,
}

#[napi_derive::napi(object)]
pub struct RuntimeBlobCleanupExecuteResult {
  pub scanned_candidates: i64,
  pub deleted_objects: i64,
  pub deleted_metadata: i64,
  pub skipped_still_referenced: i64,
  pub failed: i64,
  pub workspace_ids: Vec<String>,
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
