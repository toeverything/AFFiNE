//! PostgreSQL + `y-octo` document storage, 1:1 permission authorization,
//! `QuotaGate` admission, full legacy root-doc lifecycle migration, and
//! presence analytics for `server-sync`.

use std::{
  collections::{BTreeMap, HashMap, HashSet},
  sync::Arc,
};

use chrono::{DateTime, Duration, Timelike, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use server_db::{OwnedSemaphorePermit, ServerDb, WorkloadTier};
use server_spi::{CommunityQuotaGate, QuotaGate};
use server_types::AccessGrant;
use server_worker::{DEFAULT_LOCK_TTL_SECS, RedisLockLease, RedisMutex, WorkerError, new_owner_token};
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

pub const MAX_DOC_UPDATE_BYTES: usize = 32 * 1024 * 1024;
const USERSPACE_MUTEX_MAX_RETRIES: usize = 5;
const USERSPACE_MUTEX_RETRY_WAIT_MS: u64 = 100;
const USERSPACE_WRITE_DEADLINE_SECS: u64 = 30;

struct AbortOnDrop(tokio::task::JoinHandle<()>);

impl Drop for AbortOnDrop {
  fn drop(&mut self) {
    self.0.abort();
  }
}

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

/// Validates a Yjs v1 update binary using `y-octo`.
pub fn validate_doc_update(update: &[u8]) -> Result<(), SyncError> {
  if update.len() > MAX_DOC_UPDATE_BYTES {
    return Err(SyncError::DocUpdateTooLarge);
  }
  y_octo::validate_update_v1(update).map_err(|e| SyncError::DocUpdateInvalid(format!("invalid doc update: {e}")))
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

/// Extracts legacy `{ id, trash }` entries from a workspace root doc's
/// `meta.pages` array, matching `packages/backend/native/src/doc/mod.rs:592-676`.
pub fn extract_workspace_lifecycle_root_pages(bytes: &[u8]) -> Result<Vec<LegacyRootPage>, SyncError> {
  if is_empty_doc_bin(bytes) {
    return Ok(Vec::new());
  }

  let limits = y_octo::ReadLimits::default();
  match y_octo::ReadDoc::from_full_update_v1_with_limits(bytes.to_vec(), limits) {
    Ok(doc) => Ok(extract_lifecycle_pages_from_read_doc(&doc)),
    Err(y_octo::ReadError::IncompleteSnapshot(_)) => {
      let doc = y_octo::Doc::try_from_binary_v1(bytes)
        .map_err(|e| SyncError::DocUpdateInvalid(format!("root doc fallback decode failed: {e}")))?;
      Ok(extract_lifecycle_pages_from_doc(&doc))
    }
    Err(err) => Err(SyncError::DocUpdateInvalid(format!("root doc decode failed: {err}"))),
  }
}

fn push_lifecycle_page(out: &mut Vec<LegacyRootPage>, doc_id: &str, trashed: bool) {
  if !doc_id.trim().is_empty() {
    out.push(LegacyRootPage {
      doc_id: doc_id.to_owned(),
      trashed,
    });
  }
}

fn push_lifecycle_page_from_read_any(out: &mut Vec<LegacyRootPage>, any: &y_octo::ReadAny<'_>) {
  if let Some(doc_id) = any.get("id").and_then(|a| a.as_str()) {
    let trashed = any.get("trash").and_then(|a| a.as_bool()) == Some(true);
    push_lifecycle_page(out, doc_id, trashed);
  }
}

fn push_lifecycle_page_from_object(out: &mut Vec<LegacyRootPage>, object: &y_octo::AHashMap<String, y_octo::Any>) {
  if let Some(y_octo::Any::String(doc_id)) = object.get("id") {
    let trashed = matches!(object.get("trash"), Some(y_octo::Any::True));
    push_lifecycle_page(out, doc_id, trashed);
  }
}

fn extract_lifecycle_pages_from_read_doc(doc: &y_octo::ReadDoc) -> Vec<LegacyRootPage> {
  let mut pages_out = Vec::new();
  let Some(meta) = doc.map("meta") else {
    return pages_out;
  };
  match meta.get("pages") {
    Some(y_octo::ReadValue::Array(pages)) => {
      for entry in pages.iter() {
        match entry {
          y_octo::ReadValue::Map(page) => {
            if let Some(doc_id) = page.get("id").and_then(|v| v.as_any()).and_then(|a| a.as_str()) {
              let trashed = page.get("trash").and_then(|v| v.as_any()).and_then(|a| a.as_bool()) == Some(true);
              push_lifecycle_page(&mut pages_out, doc_id, trashed);
            }
          }
          y_octo::ReadValue::Any(any) => push_lifecycle_page_from_read_any(&mut pages_out, &any),
          _ => {}
        }
      }
    }
    Some(y_octo::ReadValue::Any(any)) => {
      if let Some(entries) = any.array() {
        for entry in entries {
          push_lifecycle_page_from_read_any(&mut pages_out, &entry);
        }
      }
    }
    _ => {}
  }
  pages_out
}

fn extract_lifecycle_pages_from_doc(doc: &y_octo::Doc) -> Vec<LegacyRootPage> {
  let mut pages_out = Vec::new();
  let Ok(meta) = doc.get_map("meta") else {
    return pages_out;
  };
  match meta.get("pages") {
    Some(y_octo::Value::Array(pages)) => {
      for entry in pages.iter() {
        match entry {
          y_octo::Value::Map(page) => {
            if let Some(y_octo::Value::Any(y_octo::Any::String(doc_id))) = page.get("id") {
              let trashed = matches!(page.get("trash"), Some(y_octo::Value::Any(y_octo::Any::True)));
              push_lifecycle_page(&mut pages_out, &doc_id, trashed);
            }
          }
          y_octo::Value::Any(y_octo::Any::Object(object)) => push_lifecycle_page_from_object(&mut pages_out, &object),
          _ => {}
        }
      }
    }
    Some(y_octo::Value::Any(y_octo::Any::Array(entries))) => {
      for entry in entries {
        if let y_octo::Any::Object(object) = entry {
          push_lifecycle_page_from_object(&mut pages_out, &object);
        }
      }
    }
    _ => {}
  }
  pages_out
}

fn is_grant_readonly(grant: &AccessGrant, now: DateTime<Utc>) -> bool {
  grant.limits.seat_limit <= 0 || grant.expires_at.is_some_and(|exp| now >= exp)
}

#[derive(Clone)]
enum UserspaceRedisLockBackend {
  Disabled,
  Active(RedisMutex),
  InvalidConfig(String),
}

#[derive(Clone)]
pub struct SyncStorage {
  db: ServerDb,
  quota_gate: Arc<dyn QuotaGate>,
  session_redis: UserspaceRedisLockBackend,
  userspace_lock_ttl_ms: u64,
}

impl SyncStorage {
  pub fn new(db: ServerDb) -> Self {
    Self::with_quota_gate(db, Arc::new(CommunityQuotaGate))
  }

  pub fn with_quota_gate(db: ServerDb, quota_gate: Arc<dyn QuotaGate>) -> Self {
    Self {
      db,
      quota_gate,
      session_redis: UserspaceRedisLockBackend::Disabled,
      userspace_lock_ttl_ms: DEFAULT_LOCK_TTL_SECS * 1_000,
    }
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

    if !workspace_role_allows(role, grant.rights.commercial, false, WorkspaceAction::Sync) {
      return Err(SyncError::SpaceAccessDenied {
        space_id: space_id.to_owned(),
      });
    }
    Ok(())
  }

  /// Ensures `storage_reconciliation_checkpoints` contains a completed
  /// `workspace_doc_lifecycle` checkpoint for `workspace_id`, migrating any
  /// legacy `meta.pages` document identities & trash flags from the workspace
  /// root doc before marking `completed` (1:1 with `workspace_state.rs`).
  pub async fn ensure_workspace_lifecycle(&self, workspace_id: &str, protocol_version: u8) -> Result<(), SyncError> {
    let mut tx = self.db.begin_tiered(WorkloadTier::InteractiveWrite).await?;

    let globally_active: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints \
       WHERE kind = 'workspace_doc_lifecycle_activation' AND scope = 'global' AND status = 'active')",
    )
    .fetch_one(&mut **tx.tx_mut())
    .await?;

    if globally_active && protocol_version == 1 {
      return Err(SyncError::BadRequest("Sync protocol upgrade required.".into()));
    }
    if !globally_active && protocol_version == 2 {
      return Err(SyncError::BadRequest("Workspace lifecycle not active.".into()));
    }
    if protocol_version != 2 {
      tx.commit().await?;
      return Ok(());
    }

    let already_completed: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints \
       WHERE kind = 'workspace_doc_lifecycle' AND scope = $1 AND status = 'completed')",
    )
    .bind(workspace_id)
    .fetch_one(&mut **tx.tx_mut())
    .await?;

    if already_completed {
      tx.commit().await?;
      return Ok(());
    }

    // Exclusive workspace storage lock -> root doc lock -> workspace KEY SHARE.
    lock_workspace_storage_exclusive(tx.tx_mut(), workspace_id).await?;
    lock_workspace_doc_update(tx.tx_mut(), workspace_id, workspace_id).await?;

    let still_active: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints \
       WHERE kind = 'workspace_doc_lifecycle_activation' AND scope = 'global' AND status = 'active')",
    )
    .fetch_one(&mut **tx.tx_mut())
    .await?;
    if !still_active {
      return Err(SyncError::BadRequest("Workspace lifecycle not active.".into()));
    }

    let workspace_exists: Option<String> = sqlx::query_scalar("SELECT id FROM workspaces WHERE id = $1 FOR KEY SHARE")
      .bind(workspace_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await?;
    if workspace_exists.is_none() {
      tx.commit().await?;
      return Ok(());
    }

    // Re-check under exclusive lock.
    let recheck: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints \
       WHERE kind = 'workspace_doc_lifecycle' AND scope = $1 AND status = 'completed')",
    )
    .bind(workspace_id)
    .fetch_one(&mut **tx.tx_mut())
    .await?;
    if recheck {
      tx.commit().await?;
      return Ok(());
    }

    let parts = load_workspace_doc_parts_in(tx.tx_mut(), workspace_id, workspace_id).await?;
    let source_rev = compute_source_revision(&parts);

    let (root_status, legacy_pages): (&'static str, Vec<LegacyRootPage>) = if parts.is_empty() {
      ("absent", Vec::new())
    } else {
      let blobs: Vec<Vec<u8>> = parts.into_iter().map(|p| p.blob).collect();
      tokio::task::spawn_blocking(move || {
        let slices: Vec<&[u8]> = blobs.iter().map(Vec::as_slice).collect();
        let Ok(merged) = y_octo::merge_updates_v1(slices).and_then(|u| u.encode_v1()) else {
          return ("invalid_binary", Vec::new());
        };
        match extract_workspace_lifecycle_root_pages(&merged) {
          Ok(pages) => ("decoded", pages),
          Err(_) => ("invalid_metadata", Vec::new()),
        }
      })
      .await
      .map_err(|e| SyncError::Internal(format!("root lifecycle decode task failed: {e}")))?
    };

    // Deduplicate ordinary docs; duplicate entries clear their trash state (workspace_state.rs:199-211).
    let mut unique = BTreeMap::<String, Option<bool>>::new();
    for page in legacy_pages {
      if is_ordinary_workspace_doc(workspace_id, &page.doc_id) {
        unique
          .entry(page.doc_id)
          .and_modify(|state| *state = None)
          .or_insert(Some(page.trashed));
      }
    }
    let (doc_ids, trashed): (Vec<String>, Vec<bool>) = unique
      .into_iter()
      .filter_map(|(id, state)| state.map(|is_trashed| (id, is_trashed)))
      .unzip();

    if !doc_ids.is_empty() {
      sqlx::query(
        r#"
        INSERT INTO updates(workspace_id, guid, blob, created_at)
        SELECT $1, input.doc_id, $3, date_trunc('milliseconds', clock_timestamp())
        FROM unnest($2::text[]) input(doc_id)
        LEFT JOIN workspace_pages page
          ON page.workspace_id = $1 AND page.page_id = input.doc_id
        WHERE page.lifecycle_state IS DISTINCT FROM 'deleted'
          AND NOT EXISTS (SELECT 1 FROM snapshots WHERE workspace_id = $1 AND guid = input.doc_id)
          AND NOT EXISTS (SELECT 1 FROM updates WHERE workspace_id = $1 AND guid = input.doc_id)
        "#,
      )
      .bind(workspace_id)
      .bind(&doc_ids)
      .bind(&[0u8, 0][..])
      .execute(&mut **tx.tx_mut())
      .await?;

      sqlx::query(
        r#"
        INSERT INTO workspace_pages(workspace_id, page_id, lifecycle_state, lifecycle_changed_at)
        SELECT $1, input.doc_id, 'trashed', date_trunc('milliseconds', clock_timestamp())
        FROM unnest($2::text[], $3::bool[]) input(doc_id, trashed)
        WHERE input.trashed
        ON CONFLICT (workspace_id, page_id) DO UPDATE SET
          lifecycle_state = 'trashed',
          lifecycle_changed_at = EXCLUDED.lifecycle_changed_at
        WHERE workspace_pages.lifecycle_changed_at IS NULL
          AND workspace_pages.lifecycle_state IS DISTINCT FROM 'deleted'
        "#,
      )
      .bind(workspace_id)
      .bind(&doc_ids)
      .bind(&trashed)
      .execute(&mut **tx.tx_mut())
      .await?;
    }

    invalidate_workspace_inventory_in(tx.tx_mut(), workspace_id).await?;

    let metadata = json!({
      "protocolVersion": 2,
      "rootStatus": root_status,
      "sourceRevision": source_rev,
    });

    sqlx::query(
      r#"
      INSERT INTO storage_reconciliation_checkpoints
        (kind, scope, status, cursor, metadata, completed_at, updated_at)
      VALUES
        ('workspace_doc_lifecycle', $1, 'completed', '{}'::jsonb, $2, clock_timestamp(), clock_timestamp())
      ON CONFLICT (kind, scope) DO UPDATE SET
        status = 'completed',
        metadata = EXCLUDED.metadata,
        completed_at = EXCLUDED.completed_at,
        updated_at = EXCLUDED.updated_at
      "#,
    )
    .bind(workspace_id)
    .bind(metadata)
    .execute(&mut **tx.tx_mut())
    .await?;

    tx.commit().await?;
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
      if !workspace_role_allows(ws_role, grant.rights.commercial, false, WorkspaceAction::CreateDoc) {
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
      invalidate_workspace_inventory_in(tx.tx_mut(), space_id).await?;
    }

    tx.commit().await?;

    Ok(PushDocResult {
      timestamp: created_at.timestamp_millis(),
      created: creating,
    })
  }

  async fn acquire_userspace_redis_lock(
    &self,
    user_id: &str,
    doc_id: &str,
  ) -> Result<Option<RedisLockLease>, SyncError> {
    let mutex = match &self.session_redis {
      UserspaceRedisLockBackend::Disabled => return Ok(None),
      UserspaceRedisLockBackend::InvalidConfig(err) => {
        return Err(SyncError::Internal(format!("invalid session redis config: {err}")));
      }
      UserspaceRedisLockBackend::Active(mutex) => mutex,
    };
    let resource = format!("userspace:{user_id}:{doc_id}");
    let owner = new_owner_token("v2-sync");
    let ttl_ms = self.userspace_lock_ttl_ms;

    for attempt in 0..=USERSPACE_MUTEX_MAX_RETRIES {
      match mutex.try_acquire_ms(&resource, owner.clone(), ttl_ms).await {
        Ok(lease) => return Ok(Some(lease)),
        Err(WorkerError::AlreadyLocked(_)) => {
          if attempt < USERSPACE_MUTEX_MAX_RETRIES {
            tokio::time::sleep(std::time::Duration::from_millis(USERSPACE_MUTEX_RETRY_WAIT_MS)).await;
          }
        }
        Err(err) => {
          return Err(SyncError::Internal(format!("acquire userspace redis lock: {err}")));
        }
      }
    }
    Err(SyncError::TooManyConcurrentWritings)
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
    let ttl_ms = self.userspace_lock_ttl_ms;
    let _renew_guard = redis_lease.as_ref().map(|lease| {
      let lease = lease.clone();
      let interval = std::time::Duration::from_millis((ttl_ms / 3).max(20));
      AbortOnDrop(tokio::spawn(async move {
        loop {
          tokio::time::sleep(interval).await;
          if lease.renew_ms(ttl_ms).await.is_err() {
            break;
          }
        }
      }))
    });

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

    if let Some(lease) = redis_lease
      && let Err(err) = lease.fence_and_renew_ms(self.userspace_lock_ttl_ms).await
    {
      let _ = tx.rollback().await;
      return Err(SyncError::Internal(format!(
        "userspace redis lock lost before commit: {err}"
      )));
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
      if !workspace_role_allows(role, grant.rights.commercial, false, WorkspaceAction::Sync) {
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
      }
      let timestamp: DateTime<Utc> = sqlx::query_scalar(
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
      .await?;
      timestamps.push(timestamp);
    }

    if !pending_ids.is_empty() {
      invalidate_workspace_inventory_in(tx.tx_mut(), workspace_id).await?;
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
  let lock_key = format!("domain:workspace:{workspace_id}");
  loop {
    let locked: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0))")
      .bind(&lock_key)
      .fetch_one(&mut **tx)
      .await?;
    if locked {
      return Ok(());
    }
    tokio::time::sleep(std::time::Duration::from_millis(25)).await;
  }
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
) -> Result<(), SyncError> {
  let exists: bool = sqlx::query_scalar("SELECT to_regclass('search_projection.workspace_states') IS NOT NULL")
    .fetch_one(&mut **tx)
    .await?;
  if !exists {
    return Ok(());
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
  Ok(())
}
