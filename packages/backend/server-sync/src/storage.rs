//! PostgreSQL + `y-octo` document storage, 1:1 permission authorization,
//! `QuotaGate` admission, full legacy root-doc lifecycle migration, and
//! presence analytics for `server-sync`.

use std::{
  collections::{BTreeMap, HashMap, HashSet},
  sync::Arc,
};

use chrono::{DateTime, Duration, Timelike, Utc};
use serde::{Deserialize, Serialize};
use server_db::{OwnedSemaphorePermit, ServerDb, WorkloadTier};
use server_spi::{CommunityQuotaGate, QuotaGate};
use server_types::AccessGrant;
use server_worker::{DEFAULT_LOCK_TTL_SECS, RedisLockLease, RedisMutex};
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Transaction};

pub use crate::permissions::DocAction;
use crate::{
  error::SyncError,
  permissions::{
    ALL_DOC_ACTIONS, DocRole, DocRoleInput, WorkspaceAction, WorkspaceRole, doc_role_allows,
    resolve_effective_doc_role, workspace_role_allows,
  },
  protocol::{
    DocLifecycleAction, PushDocIntent, ReservedDocKind, SpaceType, classify_reserved_doc, is_ordinary_workspace_doc,
  },
};

#[path = "storage/realtime_snapshots.rs"]
mod realtime_snapshots;
#[path = "legacy_compat/root_lifecycle_migration.rs"]
mod root_lifecycle_migration;
#[path = "legacy_compat/userspace_redis_bridge.rs"]
mod userspace_redis_bridge;

pub use self::root_lifecycle_migration::extract_workspace_lifecycle_root_pages;
use self::userspace_redis_bridge::{
  USERSPACE_WRITE_DEADLINE_SECS, UserspaceRedisLockBackend, fence_userspace_lease, spawn_lease_renewal,
};

pub const MAX_DOC_UPDATE_BYTES: usize = 32 * 1024 * 1024;
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PushDocResult {
  pub timestamp: i64,
  pub created: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DocDiff {
  pub missing: Vec<u8>,
  pub state: Vec<u8>,
  pub timestamp: i64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDocStateItem {
  pub doc_id: String,
  pub timestamp: i64,
  pub lifecycle: Option<String>,
  pub lifecycle_changed_at: Option<i64>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceState {
  pub docs: Vec<WorkspaceDocStateItem>,
  pub clocks: BTreeMap<String, i64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DocLifecycleResult {
  pub timestamp: i64,
  pub deleted_doc_ids: Option<Vec<String>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LegacyRootPage {
  pub doc_id: String,
  pub trashed: bool,
}

fn is_empty_doc_bin(bin: &[u8]) -> bool {
  bin.is_empty() || (bin.len() == 1 && bin[0] == 0) || (bin.len() == 2 && bin[0] == 0 && bin[1] == 0)
}

/// Pure `y-octo` helper: merges ordered updates and computes `(missing, state)`
/// matching `packages/backend/server/src/core/doc/reader.ts` and
/// `packages/backend/native/src/runtime/storage_runtime/current_doc.rs` 1:1.
pub fn merge_and_diff_doc(updates: &[&[u8]], state_vector: Option<&[u8]>) -> Result<(Vec<u8>, Vec<u8>), SyncError> {
  let merged = y_octo::merge_updates_v1(updates.iter().copied())
    .and_then(|u| u.encode_v1())
    .map_err(|e| SyncError::DocUpdateInvalid(format!("merge_updates_v1 failed: {e}")))?;

  let missing = match state_vector {
    Some(sv) if !sv.is_empty() => y_octo::diff_update_v1(&merged, sv)
      .map_err(|e| SyncError::DocUpdateInvalid(format!("diff_update_v1 failed: {e}")))?,
    _ => merged.clone(),
  };

  let state = y_octo::encode_state_vector_from_update_v1(&merged)
    .map_err(|e| SyncError::DocUpdateInvalid(format!("encode_state_vector_from_update_v1 failed: {e}")))?;

  Ok((missing, state))
}

/// Dedicated read limits for workspace lifecycle migration, matching
/// `packages/backend/native/src/doc/mod.rs`.
pub const WORKSPACE_LIFECYCLE_MIGRATION_READ_LIMITS: y_octo::ReadLimits = y_octo::ReadLimits {
  max_input_bytes: 256 * 1024 * 1024,
  max_structs: 16_000_000,
  max_clients: 200_000,
  max_collection_entries: 32_000_000,
  max_any_depth: y_octo::Any::DEFAULT_MAX_DEPTH,
  max_content_bytes: 256 * 1024 * 1024,
};

#[derive(Default)]
struct RejectZeroLengthSink {
  saw_zero_length: bool,
}

impl y_octo_core::decoder_v1::V1Sink for RejectZeroLengthSink {
  fn core_validates_utf8(&self) -> bool {
    false
  }
  fn validate_utf8_early(
    &mut self,
    _slot: u8,
    _value: y_octo_core::decoder_v1::Span,
  ) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_decode_error(&mut self, _err: y_octo_core::CodecError, _a: usize, _b: u64) {}
  fn record_client(&mut self, _client: u64) -> Result<bool, y_octo_core::CodecError> {
    Ok(true)
  }
  fn begin_client(&mut self, _client: u64, _count: usize) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_gc(&mut self, _id: y_octo_core::decoder_v1::WireId, _len: u64) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_skip(&mut self, _id: y_octo_core::decoder_v1::WireId, _len: u64) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_item(
    &mut self,
    _id: y_octo_core::decoder_v1::WireId,
    _len: u64,
    _meta: y_octo_core::decoder_v1::ItemMetaCore,
  ) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_skipped_zero_origin(&mut self, _origin_left: y_octo_core::decoder_v1::WireId) {
    self.saw_zero_length = true;
  }
  fn on_deleted(&mut self, _len: u64) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_json_start(&mut self, _count: usize) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_json_value(&mut self, _value: y_octo_core::decoder_v1::Span) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_json_finish(&mut self) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_binary(&mut self, _value: y_octo_core::decoder_v1::Span) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_string(&mut self, _value: y_octo_core::decoder_v1::Span) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_embed(&mut self, _value: y_octo_core::decoder_v1::Span) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_format(
    &mut self,
    _key: y_octo_core::decoder_v1::Span,
    _value: y_octo_core::decoder_v1::Span,
  ) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_type(
    &mut self,
    _kind: u64,
    _tag: Option<y_octo_core::decoder_v1::Span>,
  ) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_any_content_start(&mut self, _count: usize) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_any_content_value(&mut self) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_any_content_finish(&mut self) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_doc(&mut self, _guid: y_octo_core::decoder_v1::Span) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_any_start(&mut self) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_any_undefined(&mut self) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_any_null(&mut self) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_any_i32(&mut self, _value: i32) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_any_f32_bits(&mut self, _bits: u32) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_any_f64_bits(&mut self, _bits: u64) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_any_i64_bits(&mut self, _bits: u64) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_any_bool(&mut self, _value: bool) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_any_str(&mut self, _value: y_octo_core::decoder_v1::Span) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_any_bytes(&mut self, _value: y_octo_core::decoder_v1::Span) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_any_begin_object(&mut self, _count: usize) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_any_object_key(&mut self, _key: y_octo_core::decoder_v1::Span) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_any_begin_array(&mut self, _count: usize) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_any_end_container(&mut self) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_any_finish(&mut self, _range: y_octo_core::decoder_v1::Span) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn begin_delete_client(&mut self, _client: u64, _count: usize) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
  fn on_delete_range(&mut self, _client: u64, _start: u64, _end: u64) -> Result<(), y_octo_core::CodecError> {
    Ok(())
  }
}

/// Validates a Yjs v1 update binary using `y-octo`, strictly rejecting new
/// zero-length struct frames at the write boundary.
pub fn validate_doc_update(update: &[u8]) -> Result<(), SyncError> {
  if update.len() > MAX_DOC_UPDATE_BYTES {
    return Err(SyncError::DocUpdateTooLarge);
  }
  y_octo::validate_update_v1(update).map_err(|e| SyncError::DocUpdateInvalid(format!("invalid doc update: {e}")))?;

  let mut sink = RejectZeroLengthSink::default();
  let limits = y_octo_core::decoder_v1::DecodeLimitsCore::default_update();
  if y_octo_core::decoder_v1::decode_update_v1(update, &mut sink, &limits).is_err() || sink.saw_zero_length {
    return Err(SyncError::DocUpdateInvalid(
      "invalid doc update: zero-length struct".to_owned(),
    ));
  }
  Ok(())
}

/// Offloads Yjs v1 update validation to Tokio's blocking thread pool.
pub async fn validate_doc_update_async(update: Vec<u8>) -> Result<(), SyncError> {
  if update.len() > MAX_DOC_UPDATE_BYTES {
    return Err(SyncError::DocUpdateTooLarge);
  }
  tokio::task::spawn_blocking(move || validate_doc_update(&update))
    .await
    .map_err(|e| SyncError::Internal(format!("validation task failed: {e}")))?
}

/// Offloads Yjs v1 merge + diff + state-vector encoding to Tokio's blocking pool.
pub async fn merge_and_diff_doc_async(
  updates: Vec<Vec<u8>>,
  state_vector: Option<Vec<u8>>,
) -> Result<(Vec<u8>, Vec<u8>), SyncError> {
  tokio::task::spawn_blocking(move || {
    let slices: Vec<&[u8]> = updates.iter().map(Vec::as_slice).collect();
    merge_and_diff_doc(&slices, state_vector.as_deref())
  })
  .await
  .map_err(|e| SyncError::Internal(format!("merge/diff task failed: {e}")))?
}

fn is_grant_readonly(grant: &AccessGrant, now: DateTime<Utc>) -> bool {
  grant.limits.seat_limit <= 0 || grant.expires_at.is_some_and(|exp| now >= exp)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DocRealtimeTopic {
  ShareState,
  Grants,
  Comment,
}

impl DocRealtimeTopic {
  pub fn from_room_scope(scope: &str) -> Option<Self> {
    match scope {
      "share-state" => Some(Self::ShareState),
      "grants" => Some(Self::Grants),
      "comment" => Some(Self::Comment),
      _ => None,
    }
  }
}

/// Extension hook for commercial Copilot realtime operations
/// (`copilot.transcript.task.*` and `workspace.embedding.progress.*`).
/// When unconfigured (community edition), these operations return
/// [`SyncError::CopilotDisabled`].
#[async_trait::async_trait]
pub trait CopilotRealtimeHandler: Send + Sync {
  async fn get_transcript_task(
    &self,
    user_id: &str,
    workspace_id: &str,
    blob_id: Option<&str>,
    task_id: Option<&str>,
  ) -> Result<serde_json::Value, SyncError>;

  async fn retry_transcript_task(
    &self,
    user_id: &str,
    workspace_id: &str,
    task_id: &str,
  ) -> Result<serde_json::Value, SyncError>;

  async fn authorize_transcript_task(&self, user_id: &str, workspace_id: &str, task_id: &str) -> Result<(), SyncError>;

  async fn get_embedding_progress(&self, user_id: &str, workspace_id: &str) -> Result<serde_json::Value, SyncError>;

  async fn authorize_embedding_progress(&self, user_id: &str, workspace_id: &str) -> Result<(), SyncError>;

  async fn delegated_editor_upsert(
    &self,
    _user_id: &str,
    _connection_id: &str,
    _input: serde_json::Value,
  ) -> Result<serde_json::Value, SyncError> {
    Err(SyncError::CopilotDisabled)
  }

  async fn delegated_editor_release(
    &self,
    _user_id: &str,
    _input: serde_json::Value,
  ) -> Result<serde_json::Value, SyncError> {
    Err(SyncError::CopilotDisabled)
  }

  async fn delegated_tool_respond(
    &self,
    _user_id: &str,
    _input: serde_json::Value,
  ) -> Result<serde_json::Value, SyncError> {
    Err(SyncError::CopilotDisabled)
  }
}

#[derive(Clone)]
pub struct SyncStorage {
  pub(super) db: ServerDb,
  pub(super) quota_gate: Arc<dyn QuotaGate>,
  session_redis: UserspaceRedisLockBackend,
  pub(super) cache_redis: Option<redis::Client>,
  pub(super) cache_redis_conn: Arc<tokio::sync::Mutex<Option<redis::aio::MultiplexedConnection>>>,
  pub(super) redis_key_prefix: String,
  pub(super) external_url: String,
  pub(super) copilot_realtime: Option<Arc<dyn CopilotRealtimeHandler>>,
  pub(super) available_user_features: &'static [&'static str],
  userspace_lock_ttl_ms: u64,
  doc_sharing: server_domain::doc_sharing::DocSharingService,
  users: server_domain::users::UserService,
  notifications: server_domain::notifications::NotificationService,
  comments: server_domain::comments::CommentService,
  /// `SEARCH_PROJECTION_READY` once the search projection table and its write
  /// lock function exist, so later writes skip the catalog probes.
  search_projection_ready: Arc<std::sync::atomic::AtomicU8>,
}

const SEARCH_PROJECTION_READY: u8 = 1;

impl SyncStorage {
  pub fn new(db: ServerDb) -> Self {
    Self::with_quota_gate(db, Arc::new(CommunityQuotaGate::new()))
  }

  pub fn with_quota_gate(db: ServerDb, quota_gate: Arc<dyn QuotaGate>) -> Self {
    let noop = Arc::new(server_domain::events::NoopEventPublisher::default());
    let doc_sharing = server_domain::doc_sharing::DocSharingService::new(
      db.clone(),
      Arc::clone(&quota_gate),
      noop.clone(),
      noop.clone(),
    );
    let users = server_domain::users::UserService::new(db.clone());
    let notifications = server_domain::notifications::NotificationService::new(
      db.clone(),
      Arc::clone(&quota_gate),
      doc_sharing.clone(),
      noop.clone(),
    );
    let comments =
      server_domain::comments::CommentService::new(db.clone(), Arc::clone(&quota_gate), doc_sharing.clone(), noop);
    Self {
      db,
      quota_gate,
      session_redis: UserspaceRedisLockBackend::Disabled,
      cache_redis: None,
      cache_redis_conn: Arc::new(tokio::sync::Mutex::new(None)),
      redis_key_prefix: String::new(),
      external_url: String::new(),
      copilot_realtime: None,
      available_user_features: &["administrator"],
      userspace_lock_ttl_ms: DEFAULT_LOCK_TTL_SECS * 1_000,
      doc_sharing,
      users,
      notifications,
      comments,
      search_projection_ready: Arc::new(std::sync::atomic::AtomicU8::new(0)),
    }
  }

  pub fn with_cache_redis_url(mut self, redis_url: &str) -> Self {
    self.cache_redis = redis::Client::open(redis_url).ok();
    self
  }

  pub fn with_external_url(mut self, external_url: impl Into<String>) -> Self {
    self.external_url = external_url.into();
    self
  }

  pub fn with_redis_key_prefix(mut self, prefix: impl Into<String>) -> Self {
    self.redis_key_prefix = prefix.into();
    self
  }

  pub fn with_copilot_realtime(mut self, handler: Arc<dyn CopilotRealtimeHandler>) -> Self {
    self.copilot_realtime = Some(handler);
    self
  }

  pub fn with_available_user_features(mut self, features: &'static [&'static str]) -> Self {
    self.available_user_features = features;
    self
  }

  pub fn has_copilot_realtime(&self) -> bool {
    self.copilot_realtime.is_some()
  }

  pub async fn get_doc_id_aliases(&self, workspace_id: &str) -> Result<HashMap<String, String>, SyncError> {
    self
      .doc_sharing
      .get_doc_id_aliases(workspace_id)
      .await
      .map_err(|e| map_domain_error(e, workspace_id, workspace_id))
  }

  /// Configures the `SessionRedis` mutex for userspace document writes using
  /// an empty key prefix (`""`), matching `v0.27.5` `Locker`'s literal
  /// `MutexLock:userspace:<user_id>:<doc_id>` key even when `ioredis` has a
  /// configured `keyPrefix`.
  pub fn with_session_redis_url(mut self, session_redis_url: &str) -> Result<Self, SyncError> {
    let mutex = RedisMutex::new(session_redis_url, "")
      .map_err(|e| SyncError::Internal(format!("invalid session redis url: {e}")))?;
    self.session_redis = UserspaceRedisLockBackend::Active(mutex);
    Ok(self)
  }

  pub fn with_userspace_lock_ttl_ms(mut self, ttl_ms: u64) -> Self {
    self.userspace_lock_ttl_ms = ttl_ms.max(1);
    self
  }

  pub(crate) fn with_invalid_session_redis_config(mut self, err: String) -> Self {
    self.session_redis = UserspaceRedisLockBackend::InvalidConfig(err);
    self
  }

  pub fn db(&self) -> &ServerDb {
    &self.db
  }

  pub fn quota_gate(&self) -> &Arc<dyn QuotaGate> {
    &self.quota_gate
  }

  /// Checks whether `user_id` has `Workspace.Sync` permission on `space_id`.
  ///
  /// Matches `0.27.5`: public workspaces do NOT grant `Workspace.Sync` to
  /// non-members; an active membership (`role >= Member`) is strictly required.
  pub async fn assert_space_accessible(
    &self,
    space_type: SpaceType,
    space_id: &str,
    user_id: &str,
  ) -> Result<(), SyncError> {
    if space_type == SpaceType::Userspace {
      if space_id != user_id {
        return Err(SyncError::SpaceAccessDenied {
          space_id: space_id.to_owned(),
        });
      }
      return Ok(());
    }

    let mut tx = self.db.begin_tiered(WorkloadTier::InteractiveRead).await?;
    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), space_id, Utc::now())
      .await
      .map_err(|e| SyncError::Internal(format!("quota grant resolution failed: {e}")))?;

    let member_role_str: Option<String> = sqlx::query_scalar(
      "SELECT role::text FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active'",
    )
    .bind(space_id)
    .bind(user_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await?;

    let role = member_role_str.as_deref().and_then(WorkspaceRole::parse);
    tx.commit().await?;

    if !workspace_role_allows(role, grant.rights.commercial, WorkspaceAction::Sync) {
      return Err(SyncError::SpaceAccessDenied {
        space_id: space_id.to_owned(),
      });
    }
    Ok(())
  }

  /// Reads (initializing to 0 if absent) `workspace_sync_permission_generations.generation`.
  pub async fn get_sync_permission_generation(&self, workspace_id: &str) -> Result<i64, SyncError> {
    let mut tx = self.db.begin_tiered(WorkloadTier::InteractiveRead).await?;
    let existing: Option<i64> =
      sqlx::query_scalar("SELECT generation FROM workspace_sync_permission_generations WHERE workspace_id = $1")
        .bind(workspace_id)
        .fetch_optional(&mut **tx.tx_mut())
        .await?;
    if let Some(generation) = existing {
      tx.commit().await?;
      return Ok(generation);
    }
    sqlx::query(
      "INSERT INTO workspace_sync_permission_generations(workspace_id, generation) VALUES ($1, 0) ON CONFLICT DO NOTHING",
    )
    .bind(workspace_id)
    .execute(&mut **tx.tx_mut())
    .await?;
    let generation: i64 =
      sqlx::query_scalar("SELECT generation FROM workspace_sync_permission_generations WHERE workspace_id = $1")
        .bind(workspace_id)
        .fetch_one(&mut **tx.tx_mut())
        .await?;
    tx.commit().await?;
    Ok(generation)
  }

  /// Computes allowed `DocAction`s for each requested `doc_id` in `workspace_id`.
  pub async fn resolve_workspace_doc_permissions(
    &self,
    workspace_id: &str,
    user_id: &str,
    doc_ids: &[String],
  ) -> Result<HashMap<String, HashSet<DocAction>>, SyncError> {
    let mut tx = self.db.begin_tiered(WorkloadTier::InteractiveRead).await?;
    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, Utc::now())
      .await
      .map_err(|e| SyncError::Internal(format!("quota grant resolution failed: {e}")))?;
    let perms =
      resolve_workspace_doc_permissions_in(tx.tx_mut(), workspace_id, user_id, doc_ids, grant.rights.commercial)
        .await?;
    tx.commit().await?;
    Ok(perms)
  }

  /// Appends a validated Yjs update for a workspace or userspace document.
  #[allow(clippy::too_many_arguments)]
  pub async fn push_doc_update(
    &self,
    space_type: SpaceType,
    space_id: &str,
    doc_id: &str,
    update: &[u8],
    actor_user_id: &str,
    intent: PushDocIntent,
    expected_permission_generation: Option<i64>,
    protocol_version: Option<u8>,
  ) -> Result<PushDocResult, SyncError> {
    validate_doc_update_async(update.to_vec()).await?;

    if space_type == SpaceType::Userspace {
      if space_id != actor_user_id {
        return Err(SyncError::SpaceAccessDenied {
          space_id: space_id.to_owned(),
        });
      }
      return self.push_userspace_doc_update(space_id, doc_id, update).await;
    }

    let mut now = Utc::now();
    let mut tx = self.db.begin_tiered(WorkloadTier::InteractiveWrite).await?;

    // Exact lock order: storage shared -> doc update exclusive.
    lock_workspace_storage_shared(tx.tx_mut(), space_id).await?;
    lock_workspace_doc_update(tx.tx_mut(), space_id, doc_id).await?;

    // Re-verify protocol version against global lifecycle activation & migration
    // checkpoint inside the write transaction (1:1 with document_state.rs:96-119).
    if let Some(pv) = protocol_version {
      let globally_active: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints \
         WHERE kind = 'workspace_doc_lifecycle_activation' AND scope = 'global' AND status = 'active')",
      )
      .fetch_one(&mut **tx.tx_mut())
      .await?;
      if pv == 1 && globally_active {
        return Err(SyncError::BadRequest("Sync protocol upgrade required.".into()));
      }
      if pv == 2 {
        if !globally_active {
          return Err(SyncError::BadRequest("Workspace lifecycle not active.".into()));
        }
        let migrated: bool = sqlx::query_scalar(
          "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints \
           WHERE kind = 'workspace_doc_lifecycle' AND scope = $1 AND status = 'completed')",
        )
        .bind(space_id)
        .fetch_one(&mut **tx.tx_mut())
        .await?;
        if !migrated {
          return Err(SyncError::BadRequest("Workspace lifecycle migration required.".into()));
        }
      }
    }

    // Check QuotaGate admission inside the write transaction.
    let mut grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), space_id, now)
      .await
      .map_err(|e| SyncError::Internal(format!("quota grant resolution failed: {e}")))?;
    if is_grant_readonly(&grant, now) {
      return Err(SyncError::QuotaExceeded(
        "workspace is in read-only state due to quota or license".into(),
      ));
    }

    // Check blocked flag on workspace_pages.
    let blocked: Option<bool> =
      sqlx::query_scalar("SELECT blocked FROM workspace_pages WHERE workspace_id = $1 AND page_id = $2")
        .bind(space_id)
        .bind(doc_id)
        .fetch_optional(&mut **tx.tx_mut())
        .await?;
    if blocked == Some(true) {
      return Err(SyncError::DocUpdateBlocked {
        space_id: space_id.to_owned(),
        doc_id: doc_id.to_owned(),
      });
    }

    // Reject writes to deleted tombstones.
    let deleted: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM workspace_pages WHERE workspace_id = $1 AND page_id = $2 AND lifecycle_state = 'deleted')",
    )
    .bind(space_id)
    .bind(doc_id)
    .fetch_one(&mut **tx.tx_mut())
    .await?;
    if deleted {
      return Err(SyncError::DocNotFound {
        space_id: space_id.to_owned(),
        doc_id: doc_id.to_owned(),
      });
    }

    let reserved_kind = classify_reserved_doc(space_id, doc_id, actor_user_id);
    if reserved_kind == ReservedDocKind::InvalidOrForeign {
      return Err(SyncError::AccessDenied("Document write access denied".into()));
    }
    let reserved = reserved_kind != ReservedDocKind::Ordinary;

    let source_exists: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM snapshots WHERE workspace_id = $1 AND guid = $2) \
       OR EXISTS(SELECT 1 FROM updates WHERE workspace_id = $1 AND guid = $2)",
    )
    .bind(space_id)
    .bind(doc_id)
    .fetch_one(&mut **tx.tx_mut())
    .await?;

    if !source_exists && !reserved && intent == PushDocIntent::Update {
      return Err(SyncError::DocNotFound {
        space_id: space_id.to_owned(),
        doc_id: doc_id.to_owned(),
      });
    }

    let creating = !source_exists && !reserved;

    // Align doc creation lock order with domain_command/mod.rs:207-210, 346-397:
    // storage_shared -> doc_update -> domain:workspace -> permission_facts -> permission_generation.
    if creating {
      lock_domain_workspace(tx.tx_mut(), space_id).await?;
      lock_permission_facts_in(tx.tx_mut(), actor_user_id, space_id, Some(doc_id)).await?;
      // Re-sample DB clock and re-resolve workspace grant AFTER acquiring the
      // domain:workspace & permission_facts locks so concurrent quota/license
      // revocations committed while waiting are strictly observed.
      now = sqlx::query_scalar("SELECT clock_timestamp()")
        .fetch_one(&mut **tx.tx_mut())
        .await?;
      grant = self
        .quota_gate
        .resolve_workspace_grant(tx.tx_mut(), space_id, now)
        .await
        .map_err(|e| SyncError::Internal(format!("quota grant resolution failed: {e}")))?;
      if is_grant_readonly(&grant, now) {
        return Err(SyncError::QuotaExceeded(
          "workspace is in read-only state due to quota or license".into(),
        ));
      }
    }

    // When `creating == true`, inserting `doc_grants` fires the PostgreSQL trigger
    // that updates `workspace_sync_permission_generations`. Locking with
    // `FOR NO KEY UPDATE` avoids `40P01` deadlocks under concurrent doc creation.
    lock_permission_generation_in(tx.tx_mut(), space_id, expected_permission_generation, creating).await?;

    // Verify write authorization inside the same transaction (1:1 with
    // domain_command/mod.rs:199-235):
    // - Whenever `creating == true`, ALWAYS verify `WorkspaceAction::CreateDoc`.
    // - When `creating && !has_bindings`, insert the creator's `'owner'` grant.
    // - Whenever `!creating || has_bindings`, ALSO verify `DocAction::Update`.
    let has_bindings = if creating {
      sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM doc_access_policies WHERE workspace_id = $1 AND doc_id = $2) \
         OR EXISTS(SELECT 1 FROM doc_grants WHERE workspace_id = $1 AND doc_id = $2)",
      )
      .bind(space_id)
      .bind(doc_id)
      .fetch_one(&mut **tx.tx_mut())
      .await?
    } else {
      false
    };

    if creating {
      let member_role_str: Option<String> = sqlx::query_scalar(
        "SELECT role::text FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active'",
      )
      .bind(space_id)
      .bind(actor_user_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await?;
      let ws_role = member_role_str.as_deref().and_then(WorkspaceRole::parse);
      if !workspace_role_allows(ws_role, grant.rights.commercial, WorkspaceAction::CreateDoc) {
        return Err(SyncError::AccessDenied("Document create access denied".into()));
      }

      if !has_bindings {
        // Inserting into `doc_grants` automatically fires the PostgreSQL trigger
        // `doc_grants_sync_permission_generation`, incrementing
        // `workspace_sync_permission_generations.generation` by 1.
        sqlx::query(
          "INSERT INTO doc_grants(workspace_id, doc_id, principal_type, principal_id, role, granted_by) \
           VALUES ($1, $2, 'user', $3, 'owner', $3)",
        )
        .bind(space_id)
        .bind(doc_id)
        .bind(actor_user_id)
        .execute(&mut **tx.tx_mut())
        .await?;
      }
    }

    if !creating || has_bindings {
      let perms = resolve_workspace_doc_permissions_in(
        tx.tx_mut(),
        space_id,
        actor_user_id,
        &[doc_id.to_owned()],
        grant.rights.commercial,
      )
      .await?;
      let can_write = perms
        .get(doc_id)
        .is_some_and(|actions| actions.contains(&DocAction::Update));
      if !can_write {
        return Err(SyncError::AccessDenied("Document write access denied".into()));
      }
    }

    let created_at = next_workspace_doc_update_timestamp_in(tx.tx_mut(), space_id, doc_id).await?;

    // Invalidate doc_blob_ref_projections if present.
    sqlx::query(
      "UPDATE doc_blob_ref_projections \
       SET status = 'pending', indexed_at = NULL, error_code = NULL, error_summary = NULL, updated_at = clock_timestamp() \
       WHERE workspace_id = $1 AND doc_id = $2",
    )
    .bind(space_id)
    .bind(doc_id)
    .execute(&mut **tx.tx_mut())
    .await?;

    sqlx::query("INSERT INTO updates(workspace_id, guid, blob, created_at, created_by) VALUES ($1, $2, $3, $4, $5)")
      .bind(space_id)
      .bind(doc_id)
      .bind(update)
      .bind(created_at)
      .bind(actor_user_id)
      .execute(&mut **tx.tx_mut())
      .await?;

    if creating {
      sqlx::query(
        "INSERT INTO runtime_doc_creators (workspace_id, doc_id, created_by, created_at) \
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP) \
         ON CONFLICT (workspace_id, doc_id) DO UPDATE \
         SET created_by = EXCLUDED.created_by, created_at = EXCLUDED.created_at",
      )
      .bind(space_id)
      .bind(doc_id)
      .bind(actor_user_id)
      .execute(&mut **tx.tx_mut())
      .await?;
      invalidate_workspace_inventory_in(tx.tx_mut(), space_id, &self.search_projection_ready).await?;
    }

    tx.commit().await?;

    Ok(PushDocResult {
      timestamp: created_at.timestamp_millis(),
      created: creating,
    })
  }

  async fn push_userspace_doc_update(
    &self,
    user_id: &str,
    doc_id: &str,
    update: &[u8],
  ) -> Result<PushDocResult, SyncError> {
    // 1. Acquire PG workload-tier admission permit BEFORE acquiring the Redis
    //    mutex so queuing behind PG permits never burns Redis lock TTL.
    let permit = self.db.acquire_tier_permit(WorkloadTier::InteractiveWrite).await?;

    // 2. Acquire the cross-generation `SessionRedis` lock (`MutexLock:userspace:<uid>:<doc>`).
    let redis_lease = self.acquire_userspace_redis_lock(user_id, doc_id).await?;

    // 3. Background lease renewal every ttl/3 while the PG write transaction runs.
    let _renew_guard = redis_lease
      .as_ref()
      .map(|lease| spawn_lease_renewal(lease.clone(), self.userspace_lock_ttl_ms));

    // 4. Execute the PG write transaction with a bounded deadline and a
    //    pre-commit atomic Redis lease fence.
    let deadline = std::time::Duration::from_secs(USERSPACE_WRITE_DEADLINE_SECS);
    let result = match tokio::time::timeout(
      deadline,
      self.push_userspace_doc_update_in_pg(permit, redis_lease.as_ref(), user_id, doc_id, update),
    )
    .await
    {
      Ok(res) => res,
      Err(_) => Err(SyncError::Internal("userspace doc update timed out".to_owned())),
    };

    drop(_renew_guard);
    if let Some(lease) = redis_lease
      && let Err(err) = lease.release().await
    {
      tracing::warn!(lock_key = lease.lock_key(), error = %err, "failed to release userspace redis lock");
    }
    result
  }

  async fn push_userspace_doc_update_in_pg(
    &self,
    permit: OwnedSemaphorePermit,
    redis_lease: Option<&RedisLockLease>,
    user_id: &str,
    doc_id: &str,
    update: &[u8],
  ) -> Result<PushDocResult, SyncError> {
    let mut tx = self.db.begin_with_permit(permit).await?;

    // Serialize concurrent first-writes on an absent `user_snapshots` row via
    // a transaction-scoped advisory lock so two Rust writers never race.
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
      .bind(format!("userspace-doc:{user_id}:{doc_id}"))
      .execute(&mut **tx.tx_mut())
      .await?;

    let existing: Option<(Vec<u8>, DateTime<Utc>)> =
      sqlx::query_as("SELECT blob, updated_at FROM user_snapshots WHERE user_id = $1 AND id = $2 FOR UPDATE")
        .bind(user_id)
        .bind(doc_id)
        .fetch_optional(&mut **tx.tx_mut())
        .await?;

    let quantize_ms = |dt: DateTime<Utc>| DateTime::from_timestamp_millis(dt.timestamp_millis()).unwrap_or(dt);
    let update_vec = update.to_vec();

    let (created, next_ts) = match existing {
      Some((old_blob, prev_ts)) => {
        let merged = tokio::task::spawn_blocking(move || {
          y_octo::merge_updates_v1(vec![old_blob.as_slice(), update_vec.as_slice()])
            .and_then(|u| u.encode_v1())
            .map_err(|e| SyncError::DocUpdateInvalid(format!("merge_updates_v1 failed: {e}")))
        })
        .await
        .map_err(|e| SyncError::Internal(format!("userspace merge task failed: {e}")))??;

        let prev_ms = quantize_ms(prev_ts);
        let now_ms = quantize_ms(Utc::now());
        let next = if now_ms <= prev_ms {
          prev_ms + Duration::milliseconds(1)
        } else {
          now_ms
        };

        sqlx::query("UPDATE user_snapshots SET blob = $3, updated_at = $4 WHERE user_id = $1 AND id = $2")
          .bind(user_id)
          .bind(doc_id)
          .bind(&merged)
          .bind(next)
          .execute(&mut **tx.tx_mut())
          .await?;
        (false, next)
      }
      None => {
        // Empty-table first-create: try `ON CONFLICT DO NOTHING`; if another
        // writer inserted a row between our `SELECT None` and `INSERT`, re-read
        // `FOR UPDATE`, merge both updates, and `UPDATE`.
        let initial_ts = quantize_ms(Utc::now());
        let insert_res = sqlx::query(
          "INSERT INTO user_snapshots(user_id, id, blob, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $4)
           ON CONFLICT (user_id, id) DO NOTHING",
        )
        .bind(user_id)
        .bind(doc_id)
        .bind(&update_vec)
        .bind(initial_ts)
        .execute(&mut **tx.tx_mut())
        .await?;

        if insert_res.rows_affected() == 1 {
          (true, initial_ts)
        } else {
          let (current_blob, prev_ts): (Vec<u8>, DateTime<Utc>) =
            sqlx::query_as("SELECT blob, updated_at FROM user_snapshots WHERE user_id = $1 AND id = $2 FOR UPDATE")
              .bind(user_id)
              .bind(doc_id)
              .fetch_one(&mut **tx.tx_mut())
              .await?;

          let merged = tokio::task::spawn_blocking(move || {
            y_octo::merge_updates_v1(vec![current_blob.as_slice(), update_vec.as_slice()])
              .and_then(|u| u.encode_v1())
              .map_err(|e| SyncError::DocUpdateInvalid(format!("merge_updates_v1 failed: {e}")))
          })
          .await
          .map_err(|e| SyncError::Internal(format!("userspace merge task failed: {e}")))??;

          let prev_ms = quantize_ms(prev_ts);
          let now_ms = quantize_ms(Utc::now());
          let next = if now_ms <= prev_ms {
            prev_ms + Duration::milliseconds(1)
          } else {
            now_ms
          };

          sqlx::query("UPDATE user_snapshots SET blob = $3, updated_at = $4 WHERE user_id = $1 AND id = $2")
            .bind(user_id)
            .bind(doc_id)
            .bind(&merged)
            .bind(next)
            .execute(&mut **tx.tx_mut())
            .await?;
          (false, next)
        }
      }
    };

    if let Err(err) = fence_userspace_lease(redis_lease, self.userspace_lock_ttl_ms).await {
      let _ = tx.rollback().await;
      return Err(err);
    }

    tx.commit().await?;
    Ok(PushDocResult {
      timestamp: next_ts.timestamp_millis(),
      created,
    })
  }

  /// Loads `snapshots` + `updates` (or `user_snapshots` for userspace), merges
  /// them with `y-octo` on a blocking thread, and computes
  /// `(missing, state, timestamp)`.
  pub async fn load_doc_diff(
    &self,
    space_type: SpaceType,
    space_id: &str,
    doc_id: &str,
    state_vector: Option<&[u8]>,
  ) -> Result<Option<DocDiff>, SyncError> {
    if space_type == SpaceType::Userspace {
      let mut tx = self.db.begin_tiered(WorkloadTier::InteractiveRead).await?;
      let row: Option<(Vec<u8>, DateTime<Utc>)> =
        sqlx::query_as("SELECT blob, updated_at FROM user_snapshots WHERE user_id = $1 AND id = $2")
          .bind(space_id)
          .bind(doc_id)
          .fetch_optional(&mut **tx.tx_mut())
          .await?;
      tx.commit().await?;

      let Some((blob, updated_at)) = row else {
        return Ok(None);
      };
      let (missing, state) = merge_and_diff_doc_async(vec![blob], state_vector.map(ToOwned::to_owned)).await?;
      return Ok(Some(DocDiff {
        missing,
        state,
        timestamp: updated_at.timestamp_millis(),
      }));
    }

    let mut tx = self.db.begin_tiered(WorkloadTier::InteractiveRead).await?;
    lock_workspace_storage_shared(tx.tx_mut(), space_id).await?;
    lock_workspace_doc_update(tx.tx_mut(), space_id, doc_id).await?;
    let parts = load_workspace_doc_parts_in(tx.tx_mut(), space_id, doc_id).await?;
    tx.commit().await?;

    if parts.is_empty() {
      return Ok(None);
    }

    let max_ts = parts.iter().map(|p| p.timestamp).max().expect("parts is non-empty");
    let blobs: Vec<Vec<u8>> = parts.into_iter().map(|p| p.blob).collect();
    let (missing, state) = merge_and_diff_doc_async(blobs, state_vector.map(ToOwned::to_owned)).await?;

    Ok(Some(DocDiff {
      missing,
      state,
      timestamp: max_ts.timestamp_millis(),
    }))
  }

  /// Loads workspace state (`docs` + `clocks`) matching `document_state.rs:48-56`
  /// and `workspace_state.rs::get_workspace_state_v1` 1:1 (strictly scoped to
  /// `workspace_id`, excluding `deleted` tombstones).
  pub async fn load_workspace_state(
    &self,
    workspace_id: &str,
    actor_user_id: &str,
  ) -> Result<WorkspaceState, SyncError> {
    let mut tx = self.db.begin_tiered(WorkloadTier::InteractiveRead).await?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
      .execute(&mut **tx.tx_mut())
      .await?;

    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, Utc::now())
      .await
      .map_err(|e| SyncError::Internal(format!("quota grant resolution failed: {e}")))?;

    type WorkspaceDocRow = (String, DateTime<Utc>, Option<String>, Option<DateTime<Utc>>);
    let rows: Vec<WorkspaceDocRow> = sqlx::query_as(
      r#"
      SELECT
        source.doc_id,
        source.timestamp,
        page.lifecycle_state::text AS lifecycle,
        page.lifecycle_changed_at
      FROM (
        SELECT guid AS doc_id, MAX(ts) AS timestamp
        FROM (
          SELECT guid, updated_at AS ts FROM snapshots WHERE workspace_id = $1
          UNION ALL
          SELECT guid, created_at AS ts FROM updates WHERE workspace_id = $1
        ) records
        GROUP BY guid
      ) source
      LEFT JOIN workspace_pages page
        ON page.workspace_id = $1 AND page.page_id = source.doc_id
      WHERE page.lifecycle_state IS DISTINCT FROM 'deleted'
      ORDER BY source.doc_id ASC
      "#,
    )
    .bind(workspace_id)
    .fetch_all(&mut **tx.tx_mut())
    .await?;

    let candidate_ids: Vec<String> = rows.iter().map(|(id, _, _, _)| id.clone()).collect();
    let perms = resolve_workspace_doc_permissions_in(
      tx.tx_mut(),
      workspace_id,
      actor_user_id,
      &candidate_ids,
      grant.rights.commercial,
    )
    .await?;

    let mut docs = Vec::new();
    let mut clocks = BTreeMap::new();

    for (doc_id, ts, lifecycle, lifecycle_changed_at) in rows {
      let readable = perms
        .get(&doc_id)
        .is_some_and(|actions| actions.contains(&DocAction::Read));
      if !readable {
        continue;
      }
      if is_ordinary_workspace_doc(workspace_id, &doc_id) {
        docs.push(WorkspaceDocStateItem {
          doc_id,
          timestamp: ts.timestamp_millis(),
          lifecycle,
          lifecycle_changed_at: lifecycle_changed_at.map(|t| t.timestamp_millis()),
        });
      } else {
        clocks.insert(doc_id, ts.timestamp_millis());
      }
    }

    tx.commit().await?;
    Ok(WorkspaceState { docs, clocks })
  }

  /// Loads `doc_id -> timestamp_ms` map for userspace documents.
  pub async fn load_userspace_doc_timestamps(
    &self,
    user_id: &str,
    after_timestamp: Option<i64>,
  ) -> Result<BTreeMap<String, i64>, SyncError> {
    let mut conn = self.db.acquire_tiered(WorkloadTier::InteractiveRead).await?;
    let rows: Vec<(String, DateTime<Utc>)> =
      sqlx::query_as("SELECT id, updated_at FROM user_snapshots WHERE user_id = $1")
        .bind(user_id)
        .fetch_all(&mut *conn)
        .await?;

    let mut out = BTreeMap::new();
    for (id, updated_at) in rows {
      let ts = updated_at.timestamp_millis();
      if after_timestamp.is_none_or(|min| ts > min) {
        out.insert(id, ts);
      }
    }
    Ok(out)
  }

  /// Applies `trash`, `restore`, or `delete` lifecycle transition on a workspace doc,
  /// matching `domain_command/lifecycle.rs:45-171` lock order, idempotent delete
  /// tombstone handling, `QuotaGate` restore admission, and monotonic timestamps.
  pub async fn apply_doc_lifecycle(
    &self,
    workspace_id: &str,
    doc_id: &str,
    logical_doc_id: Option<&str>,
    actor_user_id: &str,
    action: DocLifecycleAction,
  ) -> Result<DocLifecycleResult, SyncError> {
    self
      .apply_doc_lifecycle_with_options(
        workspace_id,
        doc_id,
        logical_doc_id,
        actor_user_id,
        action,
        false,
        false,
      )
      .await
  }

  #[allow(clippy::too_many_arguments)]
  pub async fn apply_doc_lifecycle_with_options(
    &self,
    workspace_id: &str,
    doc_id: &str,
    logical_doc_id: Option<&str>,
    actor_user_id: &str,
    action: DocLifecycleAction,
    require_deleted: bool,
    has_storage_identity_conflict: bool,
  ) -> Result<DocLifecycleResult, SyncError> {
    let deleting = action == DocLifecycleAction::Delete;
    if logical_doc_id.is_some() && !deleting {
      return Err(SyncError::BadRequest(
        "logical document identity is only valid for deletion".into(),
      ));
    }

    let mut doc_ids = vec![doc_id.to_owned()];
    if let Some(logical_id) = logical_doc_id {
      doc_ids.push(logical_id.to_owned());
    }
    doc_ids.sort();
    doc_ids.dedup();

    for id in &doc_ids {
      if !is_ordinary_workspace_doc(workspace_id, id) {
        return Err(SyncError::DocActionDenied {
          action: lifecycle_action_name(action).into(),
          doc_id: id.clone(),
          space_id: workspace_id.to_owned(),
        });
      }
    }

    let now = Utc::now();
    let mut tx = self.db.begin_tiered(WorkloadTier::InteractiveWrite).await?;

    // Exact lock order: storage_shared -> sorted doc_update -> domain workspace -> permission facts.
    lock_workspace_storage_shared(tx.tx_mut(), workspace_id).await?;
    for id in &doc_ids {
      lock_workspace_doc_update(tx.tx_mut(), workspace_id, id).await?;
    }
    lock_domain_workspace(tx.tx_mut(), workspace_id).await?;

    // Activation guard: Trash and Restore require an active global doc-lifecycle checkpoint;
    // Delete remains allowed even before activation.
    if !deleting {
      let is_active: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints \
         WHERE kind = 'workspace_doc_lifecycle_activation' AND scope = 'global' AND status = 'active')",
      )
      .fetch_one(&mut **tx.tx_mut())
      .await?;
      if !is_active {
        return Err(SyncError::WorkspaceLifecycleNotActive);
      }
    }

    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, now)
      .await
      .map_err(|e| SyncError::Internal(format!("quota grant resolution failed: {e}")))?;
    if action == DocLifecycleAction::Restore && is_grant_readonly(&grant, now) {
      return Err(SyncError::QuotaExceeded(
        "workspace is in read-only state due to quota or license".into(),
      ));
    }

    lock_permission_facts_in(tx.tx_mut(), actor_user_id, workspace_id, None).await?;

    let tombstones: Vec<(String, DateTime<Utc>)> = sqlx::query_as(
      "SELECT page_id, lifecycle_changed_at FROM workspace_pages \
       WHERE workspace_id = $1 AND page_id = ANY($2) AND lifecycle_state = 'deleted'",
    )
    .bind(workspace_id)
    .bind(&doc_ids)
    .fetch_all(&mut **tx.tx_mut())
    .await?;

    if require_deleted && tombstones.len() != doc_ids.len() {
      if has_storage_identity_conflict {
        return Err(SyncError::BadRequest(
          "Deleting this document would also delete another document.".into(),
        ));
      }
      return Err(SyncError::DocNotFound {
        space_id: workspace_id.to_owned(),
        doc_id: doc_id.to_owned(),
      });
    }

    let tombstone_ids: HashSet<&str> = tombstones.iter().map(|(id, _)| id.as_str()).collect();
    if deleting && !tombstones.is_empty() {
      let member_role_str: Option<String> = sqlx::query_scalar(
        "SELECT role::text FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active'",
      )
      .bind(workspace_id)
      .bind(actor_user_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await?;
      let role = member_role_str.as_deref().and_then(WorkspaceRole::parse);
      if !workspace_role_allows(role, grant.rights.commercial, WorkspaceAction::Sync) {
        return Err(SyncError::DocActionDenied {
          action: "Doc.Delete".into(),
          doc_id: doc_id.to_owned(),
          space_id: workspace_id.to_owned(),
        });
      }
    }

    let pending_ids: Vec<String> = doc_ids
      .iter()
      .filter(|id| !(deleting && tombstone_ids.contains(id.as_str())))
      .cloned()
      .collect();

    for id in &pending_ids {
      lock_doc_permission_facts_in(tx.tx_mut(), actor_user_id, workspace_id, id).await?;
    }

    let perms = resolve_workspace_doc_permissions_in(
      tx.tx_mut(),
      workspace_id,
      actor_user_id,
      &pending_ids,
      grant.rights.commercial,
    )
    .await?;
    let required = match action {
      DocLifecycleAction::Trash => DocAction::Trash,
      DocLifecycleAction::Restore => DocAction::Restore,
      DocLifecycleAction::Delete => DocAction::Delete,
    };
    for id in &pending_ids {
      if !perms.get(id).is_some_and(|a| a.contains(&required)) {
        return Err(SyncError::DocActionDenied {
          action: lifecycle_action_name(action).into(),
          doc_id: id.clone(),
          space_id: workspace_id.to_owned(),
        });
      }
      if !deleting {
        let exists: bool = sqlx::query_scalar(
          "SELECT EXISTS(SELECT 1 FROM snapshots WHERE workspace_id = $1 AND guid = $2) \
           OR EXISTS(SELECT 1 FROM updates WHERE workspace_id = $1 AND guid = $2)",
        )
        .bind(workspace_id)
        .bind(id)
        .fetch_one(&mut **tx.tx_mut())
        .await?;
        if !exists {
          return Err(SyncError::DocNotFound {
            space_id: workspace_id.to_owned(),
            doc_id: id.clone(),
          });
        }
      }
    }

    let state: Option<&str> = match action {
      DocLifecycleAction::Trash => Some("trashed"),
      DocLifecycleAction::Restore => None,
      DocLifecycleAction::Delete => Some("deleted"),
    };

    let mut timestamps: Vec<DateTime<Utc>> = tombstones.iter().map(|(_, ts)| *ts).collect();
    for id in &pending_ids {
      if deleting {
        delete_workspace_doc_rows(tx.tx_mut(), workspace_id, id).await?;
        let _ = sqlx::query(
          "DELETE FROM embedding_sources WHERE workspace_id = $1 AND source_kind = 'document' AND source_key = $2",
        )
        .bind(workspace_id)
        .bind(id)
        .execute(&mut **tx.tx_mut())
        .await?;
      } else if action == DocLifecycleAction::Trash {
        let _ = sqlx::query(
          "UPDATE embedding_sources \
           SET deleted_at = clock_timestamp(), updated_at = clock_timestamp() \
           WHERE workspace_id = $1 AND source_kind = 'document' AND source_key = $2 AND deleted_at IS NULL",
        )
        .bind(workspace_id)
        .bind(id)
        .execute(&mut **tx.tx_mut())
        .await?;
      }
      let timestamp: DateTime<Utc> = if deleting {
        sqlx::query_scalar(
          r#"
          INSERT INTO workspace_pages(workspace_id, page_id, lifecycle_state, lifecycle_changed_at)
          VALUES ($1, $2, $3::"DocLifecycleState", date_trunc('milliseconds', clock_timestamp()))
          ON CONFLICT (workspace_id, page_id) DO UPDATE SET
            lifecycle_state = EXCLUDED.lifecycle_state,
            lifecycle_changed_at = GREATEST(
              EXCLUDED.lifecycle_changed_at,
              workspace_pages.lifecycle_changed_at + interval '1 millisecond'
            ),
            title = NULL,
            summary = NULL,
            mode = 0,
            blocked = false,
            published_at = NULL
          RETURNING lifecycle_changed_at
          "#,
        )
        .bind(workspace_id)
        .bind(id)
        .bind(state)
        .fetch_one(&mut **tx.tx_mut())
        .await?
      } else {
        sqlx::query_scalar(
          r#"
          INSERT INTO workspace_pages(workspace_id, page_id, lifecycle_state, lifecycle_changed_at)
          VALUES ($1, $2, $3::"DocLifecycleState", date_trunc('milliseconds', clock_timestamp()))
          ON CONFLICT (workspace_id, page_id) DO UPDATE SET
            lifecycle_state = EXCLUDED.lifecycle_state,
            lifecycle_changed_at = GREATEST(
              EXCLUDED.lifecycle_changed_at,
              workspace_pages.lifecycle_changed_at + interval '1 millisecond'
            )
          RETURNING lifecycle_changed_at
          "#,
        )
        .bind(workspace_id)
        .bind(id)
        .bind(state)
        .fetch_one(&mut **tx.tx_mut())
        .await?
      };
      timestamps.push(timestamp);
    }

    if !pending_ids.is_empty() {
      invalidate_workspace_inventory_in(tx.tx_mut(), workspace_id, &self.search_projection_ready).await?;
    }

    let max_ts = timestamps
      .into_iter()
      .max()
      .expect("a lifecycle target has a timestamp");

    tx.commit().await?;
    Ok(DocLifecycleResult {
      timestamp: max_ts.timestamp_millis(),
      deleted_doc_ids: deleting.then_some(doc_ids),
    })
  }

  /// Deletes a userspace document from `user_snapshots`.
  pub async fn delete_userspace_doc(&self, user_id: &str, doc_id: &str) -> Result<(), SyncError> {
    let mut tx = self.db.begin_tiered(WorkloadTier::InteractiveWrite).await?;
    sqlx::query("DELETE FROM user_snapshots WHERE user_id = $1 AND id = $2")
      .bind(user_id)
      .bind(doc_id)
      .execute(&mut **tx.tx_mut())
      .await?;
    tx.commit().await?;
    Ok(())
  }

  /// Verifies that `workspace_id` exists and `user_id` holds `Workspace.Read`
  /// (either an active workspace member or a public workspace with sharing enabled).
  pub async fn assert_workspace_readable(&self, workspace_id: &str, user_id: &str) -> Result<(), SyncError> {
    let mut conn = self.db.acquire_tiered(WorkloadTier::InteractiveRead).await?;
    let ws_policy: Option<(bool, bool)> = sqlx::query_as(
      "SELECT COALESCE(p.visibility = 'public', false),
              COALESCE(p.sharing_enabled, true)
       FROM workspaces w
       LEFT JOIN workspace_access_policies p ON p.workspace_id = w.id
       WHERE w.id = $1",
    )
    .bind(workspace_id)
    .fetch_optional(conn.as_conn())
    .await?;
    let Some((is_public, sharing_enabled)) = ws_policy else {
      return Err(SyncError::SpaceAccessDenied {
        space_id: workspace_id.to_owned(),
      });
    };
    if is_public && sharing_enabled {
      return Ok(());
    }
    let is_member: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active')",
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_one(conn.as_conn())
    .await?;
    if !is_member {
      return Err(SyncError::SpaceAccessDenied {
        space_id: workspace_id.to_owned(),
      });
    }
    Ok(())
  }

  pub async fn assert_workspace_members_readable(&self, workspace_id: &str, user_id: &str) -> Result<(), SyncError> {
    let mut conn = self.db.acquire_tiered(WorkloadTier::InteractiveRead).await?;
    let is_member: bool = sqlx::query_scalar(
      "SELECT EXISTS(
         SELECT 1
         FROM workspace_members wm
         JOIN workspaces w ON w.id = wm.workspace_id
         WHERE wm.workspace_id = $1 AND wm.user_id = $2 AND wm.state = 'active'
       )",
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_one(conn.as_conn())
    .await?;
    if !is_member {
      return Err(SyncError::SpaceAccessDenied {
        space_id: workspace_id.to_owned(),
      });
    }
    Ok(())
  }

  /// Resolves the `workspace.access.get` realtime snapshot (`role`, `permissions`, `team`).
  pub async fn get_workspace_access_snapshot(
    &self,
    workspace_id: &str,
    user_id: &str,
  ) -> Result<serde_json::Value, SyncError> {
    let now = Utc::now();
    let mut tx = self.db.begin_tiered(WorkloadTier::InteractiveRead).await?;
    let ws_policy: Option<(bool, bool, bool)> = sqlx::query_as(
      "SELECT COALESCE(p.visibility = 'public', false),
              COALESCE(p.sharing_enabled, true),
              COALESCE(p.url_preview_enabled, false)
       FROM workspaces w
       LEFT JOIN workspace_access_policies p ON p.workspace_id = w.id
       WHERE w.id = $1",
    )
    .bind(workspace_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await?;
    let Some((is_public, sharing_enabled, url_preview_enabled)) = ws_policy else {
      return Err(SyncError::SpaceAccessDenied {
        space_id: workspace_id.to_owned(),
      });
    };
    let member_role_str: Option<String> = sqlx::query_scalar(
      "SELECT role::text FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active'",
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await?;
    let role = member_role_str.as_deref().and_then(WorkspaceRole::parse);
    if role.is_none() && !(is_public && sharing_enabled) {
      return Err(SyncError::SpaceAccessDenied {
        space_id: workspace_id.to_owned(),
      });
    }
    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, now)
      .await
      .map_err(|e| SyncError::Internal(format!("quota grant resolution failed: {e}")))?;
    tx.commit().await?;

    let domain_role = match role {
      Some(WorkspaceRole::Owner) => Some(server_domain::workspaces::WorkspaceRole::Owner),
      Some(WorkspaceRole::Admin) => Some(server_domain::workspaces::WorkspaceRole::Admin),
      Some(WorkspaceRole::Member) => Some(server_domain::workspaces::WorkspaceRole::Member),
      Some(WorkspaceRole::External) | None => None,
    };
    let perms = server_domain::acl::WorkspacePermissionsView::for_role(
      domain_role,
      grant.rights.commercial,
      is_public,
      sharing_enabled,
      url_preview_enabled,
    );
    let is_team = grant.billing_subject == server_types::BillingSubject::Workspace;
    Ok(perms.to_realtime_access_json(is_team))
  }

  /// Resolves the `workspace.config.get` realtime snapshot.
  pub async fn get_workspace_config_snapshot(
    &self,
    workspace_id: &str,
    user_id: &str,
  ) -> Result<serde_json::Value, SyncError> {
    self
      .assert_space_accessible(SpaceType::Workspace, workspace_id, user_id)
      .await?;
    let mut conn = self.db.acquire_tiered(WorkloadTier::InteractiveRead).await?;
    let row: Option<(bool, bool, bool, bool)> = sqlx::query_as(
      "SELECT w.enable_ai,
              COALESCE(p.sharing_enabled, true),
              COALESCE(p.url_preview_enabled, false),
              w.enable_doc_embedding
       FROM workspaces w
       LEFT JOIN workspace_access_policies p ON p.workspace_id = w.id
       WHERE w.id = $1",
    )
    .bind(workspace_id)
    .fetch_optional(conn.as_conn())
    .await?;
    let (enable_ai, enable_sharing, enable_url_preview, enable_doc_embedding) =
      row.unwrap_or((true, true, false, true));
    Ok(serde_json::json!({
      "enableAi": enable_ai,
      "enableSharing": enable_sharing,
      "enableUrlPreview": enable_url_preview,
      "enableDocEmbedding": enable_doc_embedding,
    }))
  }

  /// Resolves the `doc.share-state.get` realtime snapshot (`public`, `mode`, `defaultRole`).
  /// Enforces `Doc.Read` via `DocSharingService::get_doc_info`.
  pub async fn get_doc_share_state_snapshot(
    &self,
    workspace_id: &str,
    doc_id: &str,
    user_id: &str,
  ) -> Result<serde_json::Value, SyncError> {
    let info = self
      .doc_sharing
      .get_doc_info(workspace_id, Some(user_id), doc_id)
      .await
      .map_err(|e| map_domain_error(e, workspace_id, doc_id))?;
    Ok(match info {
      Some(doc) => serde_json::json!({
        "public": doc.public,
        "mode": if doc.mode == 1 { "Edgeless" } else { "Page" },
        "defaultRole": domain_doc_role_graphql_name(doc.default_role),
      }),
      None => serde_json::Value::Null,
    })
  }

  /// Resolves the `doc.grants.get` realtime snapshot with `after` cursor support.
  pub async fn get_doc_grants_snapshot(
    &self,
    workspace_id: &str,
    doc_id: &str,
    user_id: &str,
    first: i64,
    offset: i64,
    after: Option<&str>,
  ) -> Result<serde_json::Value, SyncError> {
    use base64::Engine as _;
    let decoded_after = after
      .and_then(|c| base64::engine::general_purpose::STANDARD.decode(c).ok())
      .and_then(|b| String::from_utf8(b).ok())
      .map(|raw| serde_json::from_str::<String>(&raw).unwrap_or(raw));
    let (total_count, items, has_next_page) = self
      .doc_sharing
      .paginate_granted_users(workspace_id, doc_id, user_id, first, offset, decoded_after.as_deref())
      .await
      .map_err(|e| map_domain_error(e, workspace_id, doc_id))?;
    let end_cursor = items.last().map(|g| {
      let iso = g.created_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
      let json_iso = serde_json::to_string(&iso).unwrap_or_else(|_| format!("\"{iso}\""));
      base64::engine::general_purpose::STANDARD.encode(json_iso.as_bytes())
    });
    let edges: Vec<serde_json::Value> = items
      .into_iter()
      .map(|g| {
        serde_json::json!({
          "node": {
            "role": domain_doc_role_graphql_name(g.role),
            "user": {
              "id": g.user_id,
              "name": g.name,
              "email": g.email,
              "avatarUrl": g.avatar_url,
            }
          }
        })
      })
      .collect();
    Ok(serde_json::json!({
      "totalCount": total_count,
      "pageInfo": {
        "endCursor": end_cursor,
        "hasNextPage": has_next_page,
      },
      "edges": edges,
    }))
  }

  pub async fn get_user_settings_snapshot(&self, user_id: &str) -> Result<serde_json::Value, SyncError> {
    let settings = self
      .users
      .get_settings(user_id)
      .await
      .map_err(|e| map_domain_error(e, "", ""))?;
    Ok(serde_json::json!({
      "receiveInvitationEmail": settings.receive_invitation_email,
      "receiveMentionEmail": settings.receive_mention_email,
      "receiveCommentEmail": settings.receive_comment_email,
    }))
  }

  /// Authorizes subscription to doc-scoped realtime topics (`doc.share-state.changed`,
  /// `doc.grants.changed`, `comment.changed`), resolving logical-to-physical doc ID aliases.
  pub async fn assert_doc_realtime_topic_access(
    &self,
    workspace_id: &str,
    doc_id: &str,
    user_id: &str,
    topic: DocRealtimeTopic,
  ) -> Result<(), SyncError> {
    let perms = self
      .doc_sharing
      .get_doc_permissions(workspace_id, Some(user_id), doc_id)
      .await
      .map_err(|e| map_domain_error(e, workspace_id, doc_id))?;
    let (allowed, action) = match topic {
      DocRealtimeTopic::ShareState => (perms.is_some_and(|p| p.doc_read), "Doc.Read"),
      DocRealtimeTopic::Grants => (perms.is_some_and(|p| p.doc_users_read), "Doc.Users.Read"),
      DocRealtimeTopic::Comment => (perms.is_some_and(|p| p.doc_comments_read), "Doc.Comments.Read"),
    };
    if !allowed {
      return Err(SyncError::DocActionDenied {
        action: action.to_owned(),
        doc_id: doc_id.to_owned(),
        space_id: workspace_id.to_owned(),
      });
    }
    Ok(())
  }

  /// Resolves the `notification.count.get` realtime snapshot.
  pub async fn get_notification_count_snapshot(&self, user_id: &str) -> Result<i64, SyncError> {
    self
      .notifications
      .count_by_user(user_id)
      .await
      .map_err(|e| map_domain_error(e, "", ""))
  }

  /// Resolves the `comment.changes.get` realtime snapshot.
  pub async fn get_comment_changes_snapshot(
    &self,
    workspace_id: &str,
    doc_id: &str,
    user_id: &str,
    after: Option<&str>,
    first: Option<i64>,
  ) -> Result<serde_json::Value, SyncError> {
    use base64::Engine as _;
    let svc = &self.comments;
    let mut cursor = after
      .and_then(|c| base64::engine::general_purpose::STANDARD.decode(c).ok())
      .and_then(|b| String::from_utf8(b).ok())
      .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
      .unwrap_or_else(|| serde_json::json!({}));
    let comment_updated_at = cursor
      .get("commentUpdatedAt")
      .and_then(|v| v.as_str())
      .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
      .map(|dt| dt.with_timezone(&Utc));
    let reply_updated_at = cursor
      .get("replyUpdatedAt")
      .and_then(|v| v.as_str())
      .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
      .map(|dt| dt.with_timezone(&Utc));

    let (take, explicit_limit) = match first {
      Some(raw) if raw > 0 => {
        let limit = raw.min(10_000);
        (limit.saturating_add(1), Some(limit))
      }
      _ => (10_000, None),
    };
    let mut changes = svc
      .list_comment_changes(
        user_id,
        workspace_id,
        doc_id,
        comment_updated_at,
        reply_updated_at,
        take,
      )
      .await
      .map_err(|e| map_domain_error(e, workspace_id, doc_id))?;
    let has_next_page = match explicit_limit {
      Some(limit) => {
        let more = (changes.len() as i64) > limit;
        changes.truncate(limit as usize);
        more
      }
      None => false,
    };
    if let Some(obj) = cursor.as_object_mut() {
      for change in &changes {
        let ts = change.item.get("updatedAt").and_then(|v| v.as_str()).map(str::to_owned);
        if let Some(ts) = ts {
          if change.comment_id.is_some() {
            obj.insert("replyUpdatedAt".to_owned(), serde_json::Value::String(ts));
          } else {
            obj.insert("commentUpdatedAt".to_owned(), serde_json::Value::String(ts));
          }
        }
      }
    }
    let end_cursor = base64::engine::general_purpose::STANDARD.encode(
      serde_json::to_string(&cursor)
        .unwrap_or_else(|_| "{}".to_owned())
        .as_bytes(),
    );
    let serialized: Vec<serde_json::Value> = changes
      .into_iter()
      .map(|c| {
        let action = match c.action {
          server_domain::comments::CommentChangeAction::Update => "update",
          server_domain::comments::CommentChangeAction::Delete => "delete",
        };
        serde_json::json!({
          "id": c.id,
          "action": action,
          "item": c.item,
          "commentId": c.comment_id,
        })
      })
      .collect();
    Ok(serde_json::json!({
      "changes": serialized,
      "startCursor": "",
      "endCursor": end_cursor,
      "hasNextPage": has_next_page,
    }))
  }

  /// Upserts `public.sync_active_users_minutely` truncated to the current UTC minute.
  pub async fn upsert_sync_active_users_minutely(&self, active_users: usize) -> Result<(), SyncError> {
    let now = Utc::now();
    let minute_ts = now.with_second(0).and_then(|t| t.with_nanosecond(0)).unwrap_or(now);

    let mut conn = self.db.acquire_tiered(WorkloadTier::InteractiveWrite).await?;
    sqlx::query(
      r#"
      INSERT INTO sync_active_users_minutely (minute_ts, active_users, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (minute_ts) DO UPDATE SET
        active_users = EXCLUDED.active_users,
        updated_at = NOW()
      "#,
    )
    .bind(minute_ts)
    .bind(active_users as i32)
    .execute(&mut *conn)
    .await?;
    Ok(())
  }
}

fn lifecycle_action_name(action: DocLifecycleAction) -> &'static str {
  match action {
    DocLifecycleAction::Trash => "Doc.Trash",
    DocLifecycleAction::Restore => "Doc.Restore",
    DocLifecycleAction::Delete => "Doc.Delete",
  }
}

fn domain_doc_role_graphql_name(role: server_domain::acl::DocRole) -> &'static str {
  match role {
    server_domain::acl::DocRole::None => "None",
    server_domain::acl::DocRole::External => "External",
    server_domain::acl::DocRole::Reader => "Reader",
    server_domain::acl::DocRole::Commenter => "Commenter",
    server_domain::acl::DocRole::Editor => "Editor",
    server_domain::acl::DocRole::Manager => "Manager",
    server_domain::acl::DocRole::Owner => "Owner",
  }
}

fn map_domain_error(err: server_types::DomainError, space_id: &str, doc_id: &str) -> SyncError {
  match err {
    server_types::DomainError::Unauthorized(msg) => SyncError::AuthenticationRequired(msg),
    server_types::DomainError::Forbidden(msg) => {
      if let Some(rest) = msg.strip_prefix("doc_action_denied:") {
        let (parsed_space, parsed_doc, action) = match rest.split_once(':') {
          Some((sp, rem)) => match rem.split_once(':') {
            Some((dc, act)) if !sp.is_empty() && !dc.is_empty() && !act.is_empty() => (sp, dc, act),
            _ => (space_id, doc_id, rest),
          },
          None => (space_id, doc_id, rest),
        };
        SyncError::DocActionDenied {
          action: action.to_owned(),
          doc_id: parsed_doc.to_owned(),
          space_id: parsed_space.to_owned(),
        }
      } else {
        SyncError::AccessDenied(msg)
      }
    }
    server_types::DomainError::NotFound(_) => SyncError::DocNotFound {
      space_id: space_id.to_owned(),
      doc_id: doc_id.to_owned(),
    },
    server_types::DomainError::Validation(msg)
    | server_types::DomainError::Conflict(msg)
    | server_types::DomainError::PreconditionFailed(msg) => SyncError::BadRequest(msg),
    server_types::DomainError::QuotaExceeded { message, .. } => SyncError::QuotaExceeded(message),
    server_types::DomainError::Internal(msg)
    | server_types::DomainError::Unavailable(msg)
    | server_types::DomainError::RateLimited(msg) => SyncError::Internal(msg),
  }
}

struct DocPart {
  blob: Vec<u8>,
  timestamp: DateTime<Utc>,
}

async fn load_workspace_doc_parts_in(
  conn: &mut sqlx::PgConnection,
  workspace_id: &str,
  doc_id: &str,
) -> Result<Vec<DocPart>, SyncError> {
  let rows: Vec<(Vec<u8>, DateTime<Utc>, bool)> = sqlx::query_as(
    r#"
    SELECT blob, updated_at AS timestamp, true AS snapshot
    FROM snapshots
    WHERE workspace_id = $1 AND guid = $2
    UNION ALL
    SELECT blob, created_at AS timestamp, false AS snapshot
    FROM updates
    WHERE workspace_id = $1 AND guid = $2
    ORDER BY snapshot DESC, timestamp ASC
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_all(conn)
  .await?;

  Ok(
    rows
      .into_iter()
      .map(|(blob, timestamp, _)| DocPart { blob, timestamp })
      .collect(),
  )
}

fn compute_source_revision(parts: &[DocPart]) -> String {
  let mut hash = Sha256::new();
  for part in parts {
    hash.update(part.timestamp.timestamp_micros().to_le_bytes());
    hash.update((part.blob.len() as u64).to_le_bytes());
    hash.update(&part.blob);
  }
  hex::encode(hash.finalize())
}

async fn lock_workspace_storage_shared(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
) -> Result<(), SyncError> {
  sqlx::query("SELECT pg_advisory_xact_lock_shared(hashtextextended($1, 0))")
    .bind(format!("storage-workspace:{workspace_id}"))
    .execute(&mut **tx)
    .await?;
  Ok(())
}

async fn lock_workspace_storage_exclusive(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
) -> Result<(), SyncError> {
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
    .bind(format!("storage-workspace:{workspace_id}"))
    .execute(&mut **tx)
    .await?;
  Ok(())
}

async fn lock_workspace_doc_update(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
) -> Result<(), SyncError> {
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
    .bind(format!("workspace-doc-update:{workspace_id}/{doc_id}"))
    .execute(&mut **tx)
    .await?;
  Ok(())
}

async fn lock_domain_workspace(tx: &mut Transaction<'_, Postgres>, workspace_id: &str) -> Result<(), SyncError> {
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
    .bind(format!("domain:workspace:{workspace_id}"))
    .execute(&mut **tx)
    .await?;
  Ok(())
}

async fn lock_permission_facts_in(
  tx: &mut Transaction<'_, Postgres>,
  actor_user_id: &str,
  workspace_id: &str,
  doc_id: Option<&str>,
) -> Result<(), SyncError> {
  sqlx::query("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE")
    .bind(workspace_id)
    .execute(&mut **tx)
    .await?;
  sqlx::query("SELECT workspace_id FROM workspace_access_policies WHERE workspace_id = $1 FOR UPDATE")
    .bind(workspace_id)
    .execute(&mut **tx)
    .await?;
  sqlx::query("SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 FOR UPDATE")
    .bind(workspace_id)
    .bind(actor_user_id)
    .execute(&mut **tx)
    .await?;
  if let Some(doc_id) = doc_id {
    lock_doc_permission_facts_in(tx, actor_user_id, workspace_id, doc_id).await?;
  }
  Ok(())
}

async fn lock_doc_permission_facts_in(
  tx: &mut Transaction<'_, Postgres>,
  actor_user_id: &str,
  workspace_id: &str,
  doc_id: &str,
) -> Result<(), SyncError> {
  sqlx::query("SELECT doc_id FROM doc_access_policies WHERE workspace_id = $1 AND doc_id = $2 FOR UPDATE")
    .bind(workspace_id)
    .bind(doc_id)
    .execute(&mut **tx)
    .await?;
  sqlx::query(
    "SELECT principal_id FROM doc_grants \
     WHERE workspace_id = $1 AND doc_id = $2 AND principal_type = 'user' AND principal_id = $3 FOR UPDATE",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(actor_user_id)
  .execute(&mut **tx)
  .await?;
  Ok(())
}

async fn lock_permission_generation_in(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  expected: Option<i64>,
  for_mutation: bool,
) -> Result<(), SyncError> {
  sqlx::query(
    "INSERT INTO workspace_sync_permission_generations(workspace_id, generation) \
     VALUES ($1, 0) ON CONFLICT (workspace_id) DO NOTHING",
  )
  .bind(workspace_id)
  .execute(&mut **tx)
  .await?;
  let sql = if for_mutation {
    "SELECT generation FROM workspace_sync_permission_generations WHERE workspace_id = $1 FOR NO KEY UPDATE"
  } else {
    "SELECT generation FROM workspace_sync_permission_generations WHERE workspace_id = $1 FOR SHARE"
  };
  let current: i64 = sqlx::query_scalar(sql).bind(workspace_id).fetch_one(&mut **tx).await?;
  if expected.is_some_and(|exp| current != exp) {
    return Err(SyncError::SyncPermissionGenerationChanged {
      space_id: workspace_id.to_owned(),
    });
  }
  Ok(())
}

async fn next_workspace_doc_update_timestamp_in(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
) -> Result<DateTime<Utc>, SyncError> {
  let ts: DateTime<Utc> = sqlx::query_scalar(
    r#"
    SELECT GREATEST(
      date_trunc('milliseconds', clock_timestamp()),
      COALESCE(MAX(ts) + interval '1 millisecond', 'epoch'::timestamptz)
    )
    FROM (
      SELECT updated_at AS ts FROM snapshots WHERE workspace_id = $1 AND guid = $2
      UNION ALL
      SELECT created_at AS ts FROM updates WHERE workspace_id = $1 AND guid = $2
    ) source
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_one(&mut **tx)
  .await?;
  Ok(ts)
}

async fn invalidate_workspace_inventory_in(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  ready: &std::sync::atomic::AtomicU8,
) -> Result<(), SyncError> {
  use std::sync::atomic::Ordering;
  let has_lock_fn = if ready.load(Ordering::Relaxed) == SEARCH_PROJECTION_READY {
    true
  } else {
    let exists: bool = sqlx::query_scalar("SELECT to_regclass('search_projection.workspace_states') IS NOT NULL")
      .fetch_one(&mut **tx)
      .await?;
    if !exists {
      return Ok(());
    }
    let has_lock_fn: bool =
      sqlx::query_scalar("SELECT to_regprocedure('search_projection.acquire_workspace_write_lock(text)') IS NOT NULL")
        .fetch_one(&mut **tx)
        .await?;
    if has_lock_fn {
      ready.store(SEARCH_PROJECTION_READY, Ordering::Relaxed);
    }
    has_lock_fn
  };
  if has_lock_fn {
    sqlx::query("SELECT search_projection.acquire_workspace_write_lock($1)")
      .bind(workspace_id)
      .execute(&mut **tx)
      .await?;
  } else {
    sqlx::query("SELECT pg_advisory_xact_lock_shared(hashtextextended('search-projection-generation', 0))")
      .execute(&mut **tx)
      .await?;
  }
  sqlx::query(
    "UPDATE search_projection.workspace_states SET \
     target_root_revision = nextval('search_projection.source_mutation_version'), \
     pending_scope = 'workspace', \
     progress = NULL, \
     claim_fence = nextval('search_projection.claim_fence'), \
     lease_owner = NULL, \
     lease_expires_at = NULL, \
     last_error = NULL, \
     available_at = now(), \
     updated_at = now() \
     WHERE workspace_id = $1",
  )
  .bind(workspace_id)
  .execute(&mut **tx)
  .await?;
  Ok(())
}

async fn resolve_workspace_doc_permissions_in(
  conn: &mut sqlx::PgConnection,
  workspace_id: &str,
  user_id: &str,
  doc_ids: &[String],
  commercial: bool,
) -> Result<HashMap<String, HashSet<DocAction>>, SyncError> {
  let mut result = HashMap::with_capacity(doc_ids.len());
  if doc_ids.is_empty() {
    return Ok(result);
  }

  let member_role_str: Option<String> = sqlx::query_scalar(
    "SELECT role::text FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active'",
  )
  .bind(workspace_id)
  .bind(user_id)
  .fetch_optional(&mut *conn)
  .await?;
  let workspace_role = member_role_str.as_deref().and_then(WorkspaceRole::parse);

  let policy_row: Option<(bool, String)> = sqlx::query_as(
    "SELECT sharing_enabled, member_default_doc_role \
     FROM workspace_access_policies WHERE workspace_id = $1",
  )
  .bind(workspace_id)
  .fetch_optional(&mut *conn)
  .await?;
  let (sharing_enabled, ws_member_default_doc_role) = match policy_row {
    Some((sharing, role)) => (sharing, DocRole::parse(&role)),
    None => (true, DocRole::Manager),
  };

  let grants: HashMap<String, DocRole> = sqlx::query_as::<_, (String, String)>(
    "SELECT doc_id, role::text FROM doc_grants \
     WHERE workspace_id = $1 AND principal_type = 'user' AND principal_id = $2 AND doc_id = ANY($3)",
  )
  .bind(workspace_id)
  .bind(user_id)
  .bind(doc_ids)
  .fetch_all(&mut *conn)
  .await?
  .into_iter()
  .map(|(doc_id, role)| (doc_id, DocRole::parse(&role)))
  .collect();

  // `public_role` is only effective when BOTH `doc_access_policies.published_at`
  // AND `workspace_pages.published_at` are non-NULL (1:1 with permission/store.rs:196-199).
  type DocPolicyRow = (String, Option<String>, String, Option<String>);
  let policies: HashMap<String, (Option<DocRole>, bool, DocRole)> = sqlx::query_as::<_, DocPolicyRow>(
    "SELECT p.doc_id, p.member_default_role, p.visibility, \
       CASE WHEN p.published_at IS NOT NULL AND EXISTS ( \
         SELECT 1 FROM workspace_pages wp \
         WHERE wp.workspace_id = $1 AND wp.page_id = p.doc_id AND wp.published_at IS NOT NULL \
       ) THEN p.public_role ELSE NULL END AS effective_public_role \
     FROM doc_access_policies p \
     WHERE p.workspace_id = $1 AND p.doc_id = ANY($2)",
  )
  .bind(workspace_id)
  .bind(doc_ids)
  .fetch_all(&mut *conn)
  .await?
  .into_iter()
  .map(|(doc_id, member_default, visibility, public_role)| {
    let md = member_default.as_deref().map(DocRole::parse);
    let pr = public_role.as_deref().map(DocRole::parse).unwrap_or(DocRole::None);
    (doc_id, (md, visibility == "public", pr))
  })
  .collect();

  for doc_id in doc_ids {
    let mut actions = HashSet::new();
    // Reserved classification only rejects foreign `userdata$` and invalid reserved
    // doc IDs; valid root, `db$*`, own `userdata$*`, and ordinary docs all flow
    // uniformly through `resolve_effective_doc_role` (1:1 with permission/store.rs:171-210).
    if classify_reserved_doc(workspace_id, doc_id, user_id) == ReservedDocKind::InvalidOrForeign {
      result.insert(doc_id.clone(), actions);
      continue;
    }

    let (doc_member_default, doc_public, public_role) =
      policies.get(doc_id).copied().unwrap_or((None, false, DocRole::None));
    let member_default_role = doc_member_default.unwrap_or(ws_member_default_doc_role);
    let explicit_user_role = grants.get(doc_id).copied();

    let effective_role = resolve_effective_doc_role(DocRoleInput {
      workspace_role,
      commercial,
      explicit_user_role,
      member_default_role,
      doc_sharing_enabled: sharing_enabled,
      doc_visibility_public: doc_public,
      public_role,
    });

    for action in ALL_DOC_ACTIONS {
      if doc_role_allows(effective_role, action) {
        actions.insert(action);
      }
    }

    result.insert(doc_id.clone(), actions);
  }

  Ok(result)
}

/// Deletes document content and dependent rows while intentionally preserving
/// `workspace_pages` so the subsequent `INSERT ... ON CONFLICT DO UPDATE`
/// tombstone retains strict monotonic `lifecycle_changed_at` timestamps across
/// same-millisecond `trash -> delete` transitions.
async fn delete_workspace_doc_rows(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
) -> Result<(), SyncError> {
  for (table, column) in [
    ("replies", "doc_id"),
    ("comment_attachments", "doc_id"),
    ("comments", "doc_id"),
    ("doc_blob_refs", "doc_id"),
    ("doc_blob_ref_projections", "doc_id"),
    ("runtime_doc_creators", "doc_id"),
    ("ai_workspace_ignored_docs", "doc_id"),
    ("workspace_doc_view_daily", "doc_id"),
    ("doc_grants", "doc_id"),
    ("doc_access_policies", "doc_id"),
    ("updates", "guid"),
    ("snapshot_histories", "guid"),
    ("snapshots", "guid"),
  ] {
    sqlx::query(&format!(
      "DELETE FROM {table} WHERE workspace_id = $1 AND {column} = $2"
    ))
    .bind(workspace_id)
    .bind(doc_id)
    .execute(&mut **tx)
    .await?;
  }
  for (table, column) in [
    ("workspace_member_last_access", "last_doc_id"),
    ("ai_sessions_metadata", "doc_id"),
    ("ai_action_runs", "doc_id"),
  ] {
    sqlx::query(&format!(
      "UPDATE {table} SET {column} = NULL WHERE workspace_id = $1 AND {column} = $2"
    ))
    .bind(workspace_id)
    .bind(doc_id)
    .execute(&mut **tx)
    .await?;
  }
  sqlx::query(
    "UPDATE embedding_sources \
     SET deleted_at = COALESCE(deleted_at, clock_timestamp()), updated_at = clock_timestamp() \
     WHERE workspace_id = $1 AND source_kind = 'document' AND source_key = $2",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .execute(&mut **tx)
  .await?;
  Ok(())
}

#[cfg(test)]
mod realtime_snapshot_tests {
  use super::root_lifecycle_migration::{LifecycleRootDecodeError, extract_workspace_lifecycle_root_pages_with_limits};
  use super::*;
  use server_db::DbConfig;
  use server_domain::users::{UpdateUserSettingsInput, UserService};
  use server_types::ServerRole;

  #[test]
  fn user_settings_snapshot_reads_jsonb_payload_and_updates() {
    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
    let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
    let template = cluster.ensure_template(&migrations).expect("ensure template");
    let lease = cluster
      .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
      .expect("lease test db");
    let db_url = lease.url().to_owned();

    let rt = tokio::runtime::Builder::new_multi_thread()
      .enable_all()
      .build()
      .unwrap();

    rt.block_on(async move {
      let db = ServerDb::connect(DbConfig {
        database_url: db_url,
        channel: "canary".into(),
        role: ServerRole::Allinone,
        selfhosted: true,
        max_connections: 4,
        statement_timeout_ms: 5_000,
        tier_permits: [8, 4, 2, 2],
      })
      .await
      .expect("connect test db");
      sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        .execute(db.pool())
        .await
        .expect("reset schema");
      db.ensure_schema_ready().await.expect("ensure schema ready");

      let user_id = "user-settings-sync-test";
      sqlx::query("INSERT INTO users (id, name, email, registered) VALUES ($1, 'Settings User', 'settings-sync@example.com', true)")
        .bind(user_id)
        .execute(db.pool())
        .await
        .expect("insert user");

      let storage = SyncStorage::new(db.clone());
      let defaults = storage.get_user_settings_snapshot(user_id).await.expect("default settings");
      assert_eq!(defaults["receiveInvitationEmail"], true);
      assert_eq!(defaults["receiveMentionEmail"], true);
      assert_eq!(defaults["receiveCommentEmail"], true);

      let users = UserService::new(db.clone());
      users
        .update_settings(
          user_id,
          UpdateUserSettingsInput {
            receive_invitation_email: Some(false),
            receive_mention_email: Some(true),
            receive_comment_email: Some(false),
          },
        )
        .await
        .expect("update settings");

      let updated = storage.get_user_settings_snapshot(user_id).await.expect("updated settings");
      assert_eq!(updated["receiveInvitationEmail"], false);
      assert_eq!(updated["receiveMentionEmail"], true);
      assert_eq!(updated["receiveCommentEmail"], false);

      // Verify doc realtime topic authorization (`doc.share-state.changed` -> Doc.Read,
      // `doc.grants.changed` -> Doc.Users.Read) and `doc.share-state.get` unauthorized denial.
      let ws_id = uuid::Uuid::new_v4().to_string();
      let reader_id = uuid::Uuid::new_v4().to_string();
      sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, 'Reader', 'rt-reader@example.com')")
        .bind(&reader_id)
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
        .bind(&ws_id)
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query(
        "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'owner', 'active', 'legacy'), ($4, $2, $5, 'member', 'active', 'legacy')",
      )
      .bind(uuid::Uuid::new_v4().to_string())
      .bind(&ws_id)
      .bind(user_id)
      .bind(uuid::Uuid::new_v4().to_string())
      .bind(&reader_id)
      .execute(db.pool())
      .await
      .unwrap();
      sqlx::query(
        "INSERT INTO doc_access_policies (workspace_id, doc_id, member_default_role, visibility) VALUES ($1, 'rt-doc', 'none', 'private')",
      )
      .bind(&ws_id)
      .execute(db.pool())
      .await
      .unwrap();
      sqlx::query(
        "INSERT INTO doc_grants (workspace_id, doc_id, principal_type, principal_id, role, granted_by) VALUES ($1, 'rt-doc', 'user', $2, 'reader', $3)",
      )
      .bind(&ws_id)
      .bind(&reader_id)
      .bind(user_id)
      .execute(db.pool())
      .await
      .unwrap();

      // Private doc: non-member denied `doc.share-state.get` with Doc.Read and `comment.changed` with Doc.Comments.Read.
      let outsider_id = uuid::Uuid::new_v4().to_string();
      let share_err = storage
        .get_doc_share_state_snapshot(&ws_id, "rt-doc", &outsider_id)
        .await
        .unwrap_err();
      assert!(matches!(
        share_err,
        SyncError::DocActionDenied { ref action, .. } if action == "Doc.Read"
      ));
      let comment_err = storage
        .assert_doc_realtime_topic_access(&ws_id, "rt-doc", &outsider_id, DocRealtimeTopic::Comment)
        .await
        .unwrap_err();
      assert!(matches!(
        comment_err,
        SyncError::DocActionDenied { ref action, .. } if action == "Doc.Comments.Read"
      ));

      // Public doc: external non-member has Doc.Read (ShareState OK) but NOT Doc.Users.Read (Grants denied).
      sqlx::query(
        "INSERT INTO workspace_pages (workspace_id, page_id, mode, published_at) VALUES ($1, 'rt-doc', 0, now())",
      )
      .bind(&ws_id)
      .execute(db.pool())
      .await
      .unwrap();
      sqlx::query(
        "UPDATE doc_access_policies SET visibility = 'public', public_role = 'external', published_at = now() WHERE workspace_id = $1 AND doc_id = 'rt-doc'",
      )
      .bind(&ws_id)
      .execute(db.pool())
      .await
      .unwrap();
      assert!(
        storage
          .assert_doc_realtime_topic_access(&ws_id, "rt-doc", &outsider_id, DocRealtimeTopic::ShareState)
          .await
          .is_ok()
      );
      let grants_err = storage
        .assert_doc_realtime_topic_access(&ws_id, "rt-doc", &outsider_id, DocRealtimeTopic::Grants)
        .await
        .unwrap_err();
      assert!(matches!(
        grants_err,
        SyncError::DocActionDenied { ref action, .. } if action == "Doc.Users.Read"
      ));

      db.pool().close().await;
    });
  }

  #[test]
  fn extract_workspace_lifecycle_root_pages_enforces_scan_phase_read_limits_without_doc_fallback() {
    assert_eq!(WORKSPACE_LIFECYCLE_MIGRATION_READ_LIMITS.max_structs, 16_000_000);
    assert_ne!(
      WORKSPACE_LIFECYCLE_MIGRATION_READ_LIMITS.max_structs,
      y_octo::ReadLimits::default().max_structs
    );

    let doc = y_octo::Doc::with_client(1);
    let mut meta = doc.get_or_create_map("meta").unwrap();
    let mut pages = doc.create_array().unwrap();
    let mut p = doc.create_map().unwrap();
    p.insert("id".to_owned(), y_octo::Any::String("limit-doc".into()))
      .unwrap();
    p.insert("trash".to_owned(), y_octo::Any::True).unwrap();
    pages.push(p).unwrap();
    meta.insert("pages".to_owned(), pages).unwrap();
    let bin = doc.encode_update_v1().unwrap();

    // Scan-phase ReadLimits (max_structs) must return ResourceLimit without falling back to unbounded Doc.
    let tiny_limits = y_octo::ReadLimits {
      max_structs: 1,
      ..y_octo::ReadLimits::default()
    };
    assert!(matches!(
      y_octo::ReadDoc::from_full_update_v1_with_limits(bin.clone(), tiny_limits.clone()),
      Err(y_octo::ReadError::ResourceLimit(_))
    ));
    let err = extract_workspace_lifecycle_root_pages_with_limits(&bin, tiny_limits).unwrap_err();
    assert!(matches!(err, LifecycleRootDecodeError::ResourceLimit(_)));
  }

  #[test]
  fn ensure_workspace_lifecycle_rethrows_resource_limit_without_completed_checkpoint() {
    struct TempDb {
      admin_url: String,
      db_name: String,
      url: String,
    }
    impl Drop for TempDb {
      fn drop(&mut self) {
        if let Ok(mut admin) = postgres::Client::connect(&self.admin_url, postgres::NoTls) {
          let _ = admin.batch_execute(&format!("DROP DATABASE IF EXISTS \"{}\" WITH (FORCE)", self.db_name));
        }
      }
    }

    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
    let suffix = uuid::Uuid::new_v4().simple().to_string();
    let db_name = format!("test_lifecycle_limit_{}", &suffix[..12]);
    let mut admin = postgres::Client::connect(cluster.admin_url(), postgres::NoTls).expect("connect test admin");
    admin
      .batch_execute(&format!("CREATE DATABASE \"{db_name}\""))
      .expect("create empty test db");
    let temp_db = TempDb {
      admin_url: cluster.admin_url().to_owned(),
      url: cluster.url_for(&db_name),
      db_name,
    };
    let db_url = temp_db.url.clone();

    let rt = tokio::runtime::Builder::new_current_thread()
      .enable_all()
      .build()
      .unwrap();
    rt.block_on(async move {
      let db = ServerDb::connect(DbConfig::new(&db_url))
        .await
        .expect("connect db");
      db.ensure_schema_ready().await.expect("ensure schema ready");
      let storage = SyncStorage::new(db.clone());
      let ws_id = uuid::Uuid::new_v4().to_string();

      sqlx::query("INSERT INTO workspaces (id, name, enable_ai, enable_doc_embedding, indexed, last_check_embeddings) VALUES ($1, 'limit-ws', true, true, false, now())")
        .bind(&ws_id)
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query(
        "INSERT INTO storage_reconciliation_checkpoints (kind, scope, status, updated_at) \
         VALUES ('workspace_doc_lifecycle_activation', 'global', 'active', now()) \
         ON CONFLICT (kind, scope) DO UPDATE SET status = 'active', updated_at = now()",
      )
      .execute(db.pool())
      .await
      .unwrap();

      let doc = y_octo::Doc::with_client(1);
      let mut meta = doc.get_or_create_map("meta").unwrap();
      let mut pages = doc.create_array().unwrap();
      let mut active_page = doc.create_map().unwrap();
      active_page
        .insert("id".to_owned(), y_octo::Any::String("page-active".into()))
        .unwrap();
      pages.push(active_page).unwrap();
      let mut trashed_page = doc.create_map().unwrap();
      trashed_page
        .insert("id".to_owned(), y_octo::Any::String("page-trashed".into()))
        .unwrap();
      trashed_page
        .insert("trash".to_owned(), y_octo::Any::True)
        .unwrap();
      pages.push(trashed_page).unwrap();
      meta.insert("pages".to_owned(), pages).unwrap();
      let bin = doc.encode_update_v1().unwrap();

      sqlx::query("INSERT INTO snapshots (workspace_id, guid, blob, created_at, updated_at) VALUES ($1, $1, $2, now(), now())")
        .bind(&ws_id)
        .bind(&bin)
        .execute(db.pool())
        .await
        .unwrap();

      let tiny_limits = y_octo::ReadLimits {
        max_structs: 1,
        ..y_octo::ReadLimits::default()
      };
      let err = storage
        .ensure_workspace_lifecycle_with_limits(&ws_id, 2, tiny_limits)
        .await
        .unwrap_err();
      assert!(matches!(err, SyncError::Internal(ref msg) if msg.contains("read limits")));

      let completed: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints \
         WHERE kind = 'workspace_doc_lifecycle' AND scope = $1 AND status = 'completed')",
      )
      .bind(&ws_id)
      .fetch_one(db.pool())
      .await
      .unwrap();
      assert!(!completed, "ResourceLimit must roll back without writing completed checkpoint");

      // Retrying the same workspace under normal migration limits succeeds, records completed,
      // and persists both active and trashed page lifecycle states.
      storage.ensure_workspace_lifecycle(&ws_id, 2).await.unwrap();

      let completed_after: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints \
         WHERE kind = 'workspace_doc_lifecycle' AND scope = $1 AND status = 'completed')",
      )
      .bind(&ws_id)
      .fetch_one(db.pool())
      .await
      .unwrap();
      assert!(completed_after, "retry under normal limits must write completed checkpoint");

      let active_seeded: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM updates WHERE workspace_id = $1 AND guid = 'page-active')",
      )
      .bind(&ws_id)
      .fetch_one(db.pool())
      .await
      .unwrap();
      let trashed_seeded: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM updates WHERE workspace_id = $1 AND guid = 'page-trashed')",
      )
      .bind(&ws_id)
      .fetch_one(db.pool())
      .await
      .unwrap();
      assert!(active_seeded, "page-active must be seeded in updates");
      assert!(trashed_seeded, "page-trashed must be seeded in updates");

      let active_state: Option<String> = sqlx::query_scalar(
        "SELECT lifecycle_state::text FROM workspace_pages WHERE workspace_id = $1 AND page_id = 'page-active'",
      )
      .bind(&ws_id)
      .fetch_optional(db.pool())
      .await
      .unwrap();
      let trashed_state: Option<String> = sqlx::query_scalar(
        "SELECT lifecycle_state::text FROM workspace_pages WHERE workspace_id = $1 AND page_id = 'page-trashed'",
      )
      .bind(&ws_id)
      .fetch_optional(db.pool())
      .await
      .unwrap();
      assert_eq!(active_state, None, "page-active must remain active (no trashed/deleted row)");
      assert_eq!(
        trashed_state.as_deref(),
        Some("trashed"),
        "page-trashed must be persisted with lifecycle_state = 'trashed'"
      );

      db.pool().close().await;
    });
  }

  #[test]
  fn doc_lifecycle_activation_guard_trash_and_hard_delete_against_pg() {
    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
    let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
    let template = cluster.ensure_template(&migrations).expect("ensure template");
    let lease = cluster
      .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
      .expect("lease test database");
    let db_url = lease.url().to_owned();

    let rt = tokio::runtime::Builder::new_multi_thread()
      .enable_all()
      .build()
      .expect("build tokio runtime");
    rt.block_on(async move {
      let db = ServerDb::connect(server_db::DbConfig {
        database_url: db_url,
        channel: "production".into(),
        role: server_types::ServerRole::Allinone,
        selfhosted: true,
        max_connections: 4,
        statement_timeout_ms: 5_000,
        tier_permits: [8, 4, 4, 2],
      })
      .await
      .expect("connect db");
      sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        .execute(db.pool())
        .await
        .expect("reset schema");
      db.ensure_schema_ready().await.expect("ensure schema ready");

      let user_id = uuid::Uuid::new_v4().to_string();
      let ws_id = uuid::Uuid::new_v4().to_string();
      let doc_trash_del = "doc-trash-delete";
      let doc_pre_act_del = "doc-pre-activation-delete";

      sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, 'Owner', 'owner-lc@example.com')")
        .bind(&user_id)
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query("INSERT INTO workspaces (id, name) VALUES ($1, 'Lifecycle WS')")
        .bind(&ws_id)
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query(
        "INSERT INTO workspace_members (id, workspace_id, user_id, role, state) \
         VALUES ($1, $2, $3, 'owner', 'active')",
      )
      .bind(uuid::Uuid::new_v4().to_string())
      .bind(&ws_id)
      .bind(&user_id)
      .execute(db.pool())
      .await
      .unwrap();

      let empty_bin = y_octo::Doc::default()
        .encode_state_as_update_v1(&Default::default())
        .unwrap();
      for doc_id in [doc_trash_del, doc_pre_act_del] {
        sqlx::query(
          "INSERT INTO snapshots (workspace_id, guid, blob, updated_at) VALUES ($1, $2, $3, clock_timestamp())",
        )
        .bind(&ws_id)
        .bind(doc_id)
        .bind(&empty_bin)
        .execute(db.pool())
        .await
        .unwrap();
        sqlx::query(
          "INSERT INTO workspace_pages (workspace_id, page_id, title, summary, mode, blocked, published_at) \
           VALUES ($1, $2, 'My Title', 'My Summary', 1, true, clock_timestamp())",
        )
        .bind(&ws_id)
        .bind(doc_id)
        .execute(db.pool())
        .await
        .unwrap();
      }

      let storage = SyncStorage::new(db.clone());

      // Before activation: Trash and Restore must fail with WorkspaceLifecycleNotActive,
      // while Delete remains allowed and clears residual workspace_pages columns.
      let err_trash = storage
        .apply_doc_lifecycle(&ws_id, doc_trash_del, None, &user_id, DocLifecycleAction::Trash)
        .await
        .unwrap_err();
      assert!(
        matches!(err_trash, SyncError::WorkspaceLifecycleNotActive),
        "expected WorkspaceLifecycleNotActive before activation, got {err_trash:?}"
      );
      let err_restore = storage
        .apply_doc_lifecycle(&ws_id, doc_trash_del, None, &user_id, DocLifecycleAction::Restore)
        .await
        .unwrap_err();
      assert!(
        matches!(err_restore, SyncError::WorkspaceLifecycleNotActive),
        "expected WorkspaceLifecycleNotActive on restore before activation, got {err_restore:?}"
      );

      storage
        .apply_doc_lifecycle(&ws_id, doc_pre_act_del, None, &user_id, DocLifecycleAction::Delete)
        .await
        .expect("Delete must succeed even before lifecycle activation");

      // Activate global workspace doc lifecycle checkpoint.
      sqlx::query(
        "INSERT INTO storage_reconciliation_checkpoints (kind, scope, status) \
         VALUES ('workspace_doc_lifecycle_activation', 'global', 'active') \
         ON CONFLICT (kind, scope) DO UPDATE SET status = 'active'",
      )
      .execute(db.pool())
      .await
      .unwrap();

      // After activation: Trash -> Delete runs end-to-end with zero SQL errors.
      storage
        .apply_doc_lifecycle(&ws_id, doc_trash_del, None, &user_id, DocLifecycleAction::Trash)
        .await
        .expect("Trash after activation");
      storage
        .apply_doc_lifecycle(&ws_id, doc_trash_del, None, &user_id, DocLifecycleAction::Delete)
        .await
        .expect("Delete after Trash");

      let row = sqlx::query(
        "SELECT lifecycle_state::text AS state, title, summary, mode, blocked, published_at \
         FROM workspace_pages WHERE workspace_id = $1 AND page_id = $2",
      )
      .bind(&ws_id)
      .bind(doc_trash_del)
      .fetch_one(db.pool())
      .await
      .unwrap();
      use sqlx::Row as _;
      assert_eq!(row.get::<Option<String>, _>("state").as_deref(), Some("deleted"));
      assert_eq!(row.get::<Option<String>, _>("title"), None);
      assert_eq!(row.get::<Option<String>, _>("summary"), None);
      assert_eq!(row.get::<i16, _>("mode"), 0);
      assert!(!row.get::<bool, _>("blocked"));
      assert_eq!(row.get::<Option<DateTime<Utc>>, _>("published_at"), None);

      let snap_exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM snapshots WHERE workspace_id = $1 AND guid = $2)")
          .bind(&ws_id)
          .bind(doc_trash_del)
          .fetch_one(db.pool())
          .await
          .unwrap();
      assert!(!snap_exists, "snapshots row must be deleted on hard delete");

      db.pool().close().await;
    });
  }
}
