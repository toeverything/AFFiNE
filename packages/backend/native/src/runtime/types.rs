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
  pub embedding: EmbeddingHealth,
}

#[napi_derive::napi(object)]
#[derive(Clone, Debug)]
pub struct EmbeddingHealth {
  pub enabled: bool,
  pub state: String,
  pub reason: Option<String>,
  pub pgvector_version: Option<String>,
  pub schema_version: Option<i32>,
  pub worker_running: bool,
}

impl EmbeddingHealth {
  pub(crate) fn disabled(reason: &str, pgvector_version: Option<String>) -> Self {
    Self {
      enabled: false,
      state: "disabled".to_string(),
      reason: Some(reason.to_string()),
      pgvector_version,
      schema_version: None,
      worker_running: false,
    }
  }
}

#[napi_derive::napi(object)]
pub struct RuntimeEmbeddingWorkspaceState {
  pub workspace_id: String,
  pub active_index_id: Option<String>,
  #[napi(ts_type = "bigint | number")]
  pub index_epoch: i64,
  pub runtime_state: String,
  pub reason_code: Option<String>,
}

#[napi_derive::napi(object)]
#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentEmbeddingUnitInput {
  pub unit_id: String,
  pub visibility: String,
  pub text: String,
  pub block_id: Option<String>,
  pub element_id: Option<String>,
  pub frame_id: Option<String>,
}

#[napi_derive::napi(object)]
#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentEmbeddingProjectionInput {
  pub doc_id: String,
  pub revision: String,
  pub source_hash: String,
  pub units: Vec<DocumentEmbeddingUnitInput>,
  pub deleted: Option<bool>,
}

#[napi_derive::napi(object)]
pub struct SyncEmbeddingStateInput {
  pub workspace_id: String,
  pub enabled: bool,
  pub documents: Option<Vec<DocumentEmbeddingProjectionInput>>,
  pub reconcile_documents: Option<bool>,
  pub priority: Option<i32>,
  pub wait_for_ready_ms: Option<u32>,
}

#[napi_derive::napi(object)]
pub struct RuntimeEmbeddingQueueCounts {
  #[napi(ts_type = "bigint | number")]
  pub pending: i64,
  #[napi(ts_type = "bigint | number")]
  pub running: i64,
  #[napi(ts_type = "bigint | number")]
  pub retry_wait: i64,
  #[napi(ts_type = "bigint | number")]
  pub ready: i64,
  #[napi(ts_type = "bigint | number")]
  pub failed: i64,
  #[napi(ts_type = "bigint | number")]
  pub expired_leases: i64,
  #[napi(ts_type = "bigint | number")]
  pub oldest_pending_seconds: i64,
  #[napi(ts_type = "bigint | number")]
  pub active_vector_rows: i64,
  #[napi(ts_type = "bigint | number")]
  pub inactive_vector_rows: i64,
  #[napi(ts_type = "bigint | number")]
  pub index_bytes: i64,
  #[napi(ts_type = "bigint | number")]
  pub retrying_indexes: i64,
  #[napi(ts_type = "bigint | number")]
  pub max_index_retry_seconds: i64,
}

#[napi_derive::napi(object)]
pub struct PutWorkspaceArtifactInput {
  pub workspace_id: String,
  pub mime_type: String,
  pub display_name: Option<String>,
  pub file_name: Option<String>,
  pub library_owned: Option<bool>,
}

#[napi_derive::napi(object)]
pub struct EnsureWorkspaceBlobArtifactInput {
  pub workspace_id: String,
  pub blob_id: String,
  pub mime_type: String,
  pub display_name: Option<String>,
  pub file_name: Option<String>,
  pub library_owned: Option<bool>,
}

#[napi_derive::napi(object)]
pub struct RuntimeWorkspaceArtifact {
  pub id: String,
  pub workspace_id: String,
  pub content_hash: String,
  pub display_name: Option<String>,
  pub file_name: Option<String>,
  pub canonical_media_type: String,
  #[napi(ts_type = "bigint | number")]
  pub size: i64,
  pub storage_scope: String,
  pub storage_key: String,
  pub status: String,
  pub library_owned: bool,
}

#[napi_derive::napi(object)]
#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopeSelectorInput {
  pub kind: String,
  pub id: String,
  pub name: Option<String>,
  pub source: String,
}

#[napi_derive::napi(object)]
pub struct CompileScopeInput {
  pub workspace_id: String,
  pub user_id: String,
  pub selectors: Vec<ScopeSelectorInput>,
  pub preferred_source_ids: Option<Vec<String>>,
}

#[napi_derive::napi(object)]
#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRetrievalScope {
  pub mode: String,
  pub required_doc_ids: Vec<String>,
  pub required_artifact_ids: Vec<String>,
  pub preferred_source_ids: Vec<String>,
}

#[napi_derive::napi(object)]
pub struct RuntimeTurnScopeSnapshot {
  pub version: u32,
  pub resolved_at: String,
  pub selectors: Vec<ScopeSelectorInput>,
  pub required_doc_ids: Vec<String>,
  pub required_artifact_ids: Vec<String>,
  pub preferred_source_ids: Vec<String>,
  pub retrieval: RuntimeRetrievalScope,
}

#[napi_derive::napi(object)]
pub struct ReadEmbeddingSourceContentInput {
  pub workspace_id: String,
  pub source_kind: String,
  pub source_key: String,
  pub retrieval: RuntimeRetrievalScope,
  pub max_chars: Option<u32>,
  pub cursor: Option<String>,
}

#[napi_derive::napi(object)]
pub struct RuntimeEmbeddingSourceContent {
  pub content: String,
  /// Active materialization token. Changes whenever extracted content is
  /// replaced.
  pub revision: String,
  pub mime_type: Option<String>,
  pub name: Option<String>,
  pub truncated: bool,
  pub next_cursor: Option<String>,
}

#[napi_derive::napi(object)]
pub struct MatchEmbeddingCandidatesInput {
  pub request_id: Option<String>,
  pub workspace_id: String,
  pub query: String,
  pub source_kind: String,
  pub retrieval: RuntimeRetrievalScope,
  pub limit: Option<u32>,
}

#[napi_derive::napi(object)]
pub struct RuntimeEmbeddingCandidate {
  pub source_kind: String,
  pub source_key: String,
  pub content: String,
  pub distance: f64,
  pub doc_id: Option<String>,
  pub artifact_id: Option<String>,
  pub unit_id: Option<String>,
  pub visibility: Option<String>,
  pub block_id: Option<String>,
  pub element_id: Option<String>,
  pub frame_id: Option<String>,
  pub chunk: i32,
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
pub struct RuntimeWorkspaceActionDecision {
  pub allowed: bool,
  pub retry_after_seconds: Option<i32>,
  pub reason: Option<String>,
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

#[derive(Default)]
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
pub struct RuntimeDocumentCleanupReconcileResult {
  pub scanned_docs: i64,
  pub marked: i64,
  pub reset: i64,
  pub recovered: i64,
}

#[napi_derive::napi(object)]
pub struct RuntimeDocumentCleanupEffect {
  pub workspace_id: String,
  pub doc_id: String,
  pub cleanup_version: String,
  pub comment_objects_done: bool,
}

#[napi_derive::napi(object)]
pub struct RuntimeDocumentCleanupExecuteResult {
  pub scanned_candidates: i64,
  pub serialization_retries: i64,
  pub executed: i64,
  pub recovered: i64,
  pub reset: i64,
  pub failed: i64,
  pub deleted_rows: i64,
  pub effects: Vec<RuntimeDocumentCleanupEffect>,
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
pub struct RuntimeEmbeddingProgress {
  pub total: i64,
  pub embedded: i64,
}

#[napi_derive::napi(object)]
pub struct SearchOperationOutput {
  pub ok: bool,
  pub value: Option<serde_json::Value>,
  pub error_code: Option<String>,
}
