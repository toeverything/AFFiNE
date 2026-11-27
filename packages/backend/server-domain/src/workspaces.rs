//! Canonical workspace, membership/ACL, and usage query domain service.

use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use server_db::{ServerDb, WorkloadTier};
use server_spi::{
  BillingSpi, CommunityBillingSpi, CommunityRateLimitPolicy, QuotaGate, RateLimitPolicy, RequestSource,
};
use server_types::DomainError;
use sqlx::{Postgres, Row, Transaction};
use uuid::Uuid;

use crate::{
  auth::canonical_email,
  events::{InvalidationHintV1, InvalidationPublisher},
};

/// Chargeable invitation statuses matching `v0.27.5` `InvitationStatus::CHARGEABLE`.
pub const CHARGEABLE_INVITATION_STATUSES: [&str; 3] = ["pending", "waiting_review", "waiting_seat"];

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceRole {
  Owner,
  Admin,
  Member,
}

impl WorkspaceRole {
  pub const fn as_str(self) -> &'static str {
    match self {
      Self::Owner => "owner",
      Self::Admin => "admin",
      Self::Member => "member",
    }
  }

  pub fn parse(raw: &str) -> Result<Self, DomainError> {
    match raw.to_ascii_lowercase().as_str() {
      "owner" => Ok(Self::Owner),
      "admin" => Ok(Self::Admin),
      "member" => Ok(Self::Member),
      other => Err(DomainError::Validation(format!("invalid workspace role: {other:?}"))),
    }
  }

  /// Effective role under the workspace's commercial feature gate: without a
  /// commercial grant, `Admin` degrades to `Member` (`access_control/permission.rs`).
  pub const fn effective(self, commercial: bool) -> Self {
    if !commercial && matches!(self, Self::Admin) {
      Self::Member
    } else {
      self
    }
  }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRecord {
  pub id: String,
  pub sid: i32,
  pub name: Option<String>,
  pub avatar_key: Option<String>,
  pub public: bool,
  pub enable_ai: bool,
  pub enable_doc_embedding: bool,
  pub enable_sharing: bool,
  pub enable_url_preview: bool,
  pub indexed: bool,
  pub created_at: DateTime<Utc>,
  pub last_check_embeddings: DateTime<Utc>,
}

#[derive(Clone, Debug, Default)]
pub struct UpdateWorkspaceInput {
  pub name: Option<Option<String>>,
  pub avatar_key: Option<Option<String>>,
  pub public: Option<bool>,
  pub enable_ai: Option<bool>,
  pub enable_doc_embedding: Option<bool>,
  pub enable_sharing: Option<bool>,
  pub enable_url_preview: Option<bool>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMemberRecord {
  pub id: String,
  pub workspace_id: String,
  pub user_id: String,
  pub role: WorkspaceRole,
  pub state: String,
  pub source: String,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInvitationRecord {
  pub id: String,
  pub workspace_id: String,
  pub invitee_user_id: Option<String>,
  pub normalized_email: Option<String>,
  pub inviter_user_id: Option<String>,
  pub requested_role: WorkspaceRole,
  pub status: String,
  pub created_at: DateTime<Utc>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceUsage {
  pub used_storage_quota: i64,
  pub member_count: i32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EffectiveWorkspaceRole {
  Owner,
  Admin,
  Collaborator,
  External,
}

pub use crate::acl::WorkspacePermissionsView;

const NANOID_ALPHABET: &[u8; 64] = b"useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

fn generate_invite_link_nanoid() -> String {
  use rand::RngCore as _;
  let mut buf = [0u8; 21];
  rand::rng().fill_bytes(&mut buf);
  buf
    .iter()
    .map(|&b| NANOID_ALPHABET[(b & 63) as usize] as char)
    .collect()
}

const CREATE_INVITE_LINK_LUA: &str = r#"
local ws_key = KEYS[1]
local id_key = KEYS[2]
local ws_val = ARGV[1]
local id_val = ARGV[2]
local ttl_ms = tonumber(ARGV[3])
local existing = redis.call("GET", ws_key)
if existing then
  local pttl = redis.call("PTTL", ws_key)
  if pttl > 0 then
    return {existing, tostring(pttl)}
  end
end
redis.call("SET", ws_key, ws_val, "PX", ttl_ms)
redis.call("SET", id_key, id_val, "PX", ttl_ms)
return {ws_val, tostring(ttl_ms)}
"#;

const REVOKE_INVITE_LINK_LUA: &str = r#"
local ws_key = KEYS[1]
local id_prefix = ARGV[1]
local existing = redis.call("GET", ws_key)
local deleted = redis.call("DEL", ws_key)
if existing then
  local ok, parsed = pcall(cjson.decode, existing)
  if ok and type(parsed) == "table" and type(parsed["inviteId"]) == "string" and #parsed["inviteId"] > 0 then
    redis.call("DEL", id_prefix .. parsed["inviteId"])
  end
end
return deleted
"#;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkspaceMemberView {
  pub id: String,
  pub name: String,
  pub email: String,
  pub avatar_url: Option<String>,
  pub email_verified: bool,
  pub disabled: bool,
  pub role: WorkspaceRole,
  pub invite_id: String,
  pub status: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkspaceInviteLink {
  pub invite_id: String,
  pub workspace_id: String,
  pub inviter_user_id: String,
  pub expire_time: DateTime<Utc>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InviteInfoView {
  pub workspace_id: String,
  pub workspace_name: String,
  pub workspace_avatar_key: Option<String>,
  pub owner: crate::users::CurrentUserView,
  pub invitee: crate::users::CurrentUserView,
  pub status: Option<String>,
  pub is_link: bool,
}

#[derive(Clone)]
pub struct WorkspaceService {
  db: ServerDb,
  quota_gate: Arc<dyn QuotaGate>,
  invalidation: Arc<dyn InvalidationPublisher>,
  event_bus: Arc<dyn crate::events::EventBusPublisher>,
  rate_limit_policy: Arc<dyn RateLimitPolicy>,
  billing_spi: Arc<dyn BillingSpi>,
  redis: Option<redis::Client>,
  base_url: String,
  private_key: String,
  fallback_invite_links: Arc<tokio::sync::RwLock<std::collections::HashMap<String, WorkspaceInviteLink>>>,
}

impl WorkspaceService {
  pub fn new(db: ServerDb, quota_gate: Arc<dyn QuotaGate>, invalidation: Arc<dyn InvalidationPublisher>) -> Self {
    Self {
      db,
      quota_gate,
      invalidation,
      event_bus: Arc::new(crate::events::NoopEventPublisher::default()),
      rate_limit_policy: Arc::new(CommunityRateLimitPolicy),
      billing_spi: Arc::new(CommunityBillingSpi),
      redis: None,
      base_url: "http://localhost:3010".to_owned(),
      private_key: String::new(),
      fallback_invite_links: Arc::new(tokio::sync::RwLock::new(std::collections::HashMap::new())),
    }
  }

  pub fn with_base_url(mut self, base_url: impl Into<String>) -> Self {
    self.base_url = base_url.into();
    self
  }

  pub fn with_private_key(mut self, private_key: impl Into<String>) -> Self {
    self.private_key = private_key.into();
    self
  }

  pub fn with_event_bus(mut self, event_bus: Arc<dyn crate::events::EventBusPublisher>) -> Self {
    self.event_bus = event_bus;
    self
  }

  pub fn with_rate_limit_policy(mut self, rate_limit_policy: Arc<dyn RateLimitPolicy>) -> Self {
    self.rate_limit_policy = rate_limit_policy;
    self
  }

  pub fn with_billing_spi(mut self, billing_spi: Arc<dyn BillingSpi>) -> Self {
    self.billing_spi = billing_spi;
    self
  }

  async fn publish_workspace_members_changed(&self, workspace_id: &str, reason: &str) {
    let _ = self
      .event_bus
      .publish_event(
        "realtime.topic.changed",
        serde_json::json!({
          "topic": "workspace.members.changed",
          "room": format!("workspace:{workspace_id}:members"),
          "input": { "workspaceId": workspace_id },
          "event": { "changed": true, "reason": reason },
        }),
        None,
      )
      .await;
  }

  async fn notify_billing_members_changed(&self, workspace_id: &str) {
    self
      .publish_workspace_members_changed(workspace_id, "members-updated")
      .await;
    if let Err(err) = self.billing_spi.on_workspace_members_changed(workspace_id).await {
      tracing::warn!(workspace_id, error = %err, "billing_spi on_workspace_members_changed failed");
    }
  }

  pub fn with_redis(mut self, redis: Option<redis::Client>) -> Self {
    self.redis = redis;
    self
  }

  /// Atomically creates a workspace, its default private access policy, the
  /// active owner membership (`id = "perm_<32hex>"`), and marks admin stats
  /// dirty inside a single [`WorkloadTier::InteractiveWrite`] [`server_db::TieredTx`].
  ///
  /// PostgreSQL triggers on `workspace_access_policies` and `workspace_members`
  /// automatically maintain `workspace_sync_permission_generations` (matching
  /// `v0.27.5` generation increments 1:1). After commit, publishes
  /// `workspaceInventoryChanged` to `affine:backend-runtime:invalidation:v1`.
  pub async fn create_workspace(
    &self,
    owner_user_id: &str,
    name: Option<&str>,
  ) -> Result<WorkspaceRecord, DomainError> {
    self.create_workspace_with_init(owner_user_id, name, None).await
  }

  /// Atomically creates a workspace, its default private access policy, the
  /// active owner membership, optional initial root Yjs snapshot, and marks
  /// admin stats dirty inside one [`WorkloadTier::InteractiveWrite`] transaction.
  pub async fn create_workspace_with_init(
    &self,
    owner_user_id: &str,
    name: Option<&str>,
    init_bytes: Option<&[u8]>,
  ) -> Result<WorkspaceRecord, DomainError> {
    if let Some(bytes) = init_bytes {
      validate_workspace_init_update(bytes)?;
    }

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin create_workspace: {e}")))?;

    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load create_workspace timestamp: {e}")))?;

    let workspace_id = Uuid::new_v4().to_string();
    let epoch = DateTime::<Utc>::UNIX_EPOCH;
    let sid: i32 = sqlx::query_scalar(
      r#"INSERT INTO workspaces
           (id, name, avatar_key, enable_ai, enable_doc_embedding, indexed, last_check_embeddings, created_at)
         VALUES ($1, $2, NULL, true, true, false, $3, $4)
         RETURNING sid"#,
    )
    .bind(&workspace_id)
    .bind(name)
    .bind(epoch)
    .bind(now)
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("insert workspace: {e}")))?;

    sqlx::query(
      r#"INSERT INTO workspace_access_policies
           (workspace_id, visibility, sharing_enabled, url_preview_enabled, member_default_doc_role, created_at, updated_at)
         VALUES ($1, 'private', true, false, 'manager', $2, $2)"#,
    )
    .bind(&workspace_id)
    .bind(now)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("insert workspace_access_policies: {e}")))?;

    let member_id = format!("perm_{}", Uuid::new_v4().simple());
    sqlx::query(
      r#"INSERT INTO workspace_members
           (id, workspace_id, user_id, role, source, state, created_at, updated_at)
         VALUES ($1, $2, $3, 'owner', 'legacy', 'active', $4, $4)"#,
    )
    .bind(&member_id)
    .bind(&workspace_id)
    .bind(owner_user_id)
    .bind(now)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("insert workspace owner member: {e}")))?;

    if let Some(bytes) = init_bytes {
      sqlx::query(
        r#"INSERT INTO snapshots (workspace_id, guid, blob, state, created_at, updated_at, created_by, updated_by)
           VALUES ($1, $2, $3, NULL, $4, $4, $5, $5)"#,
      )
      .bind(&workspace_id)
      .bind(&workspace_id)
      .bind(bytes)
      .bind(now)
      .bind(owner_user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("insert workspace init snapshot: {e}")))?;
    }

    sqlx::query(
      r#"INSERT INTO workspace_admin_stats_dirty (workspace_id, updated_at)
         VALUES ($1, $2)
         ON CONFLICT (workspace_id) DO UPDATE SET updated_at = EXCLUDED.updated_at"#,
    )
    .bind(&workspace_id)
    .bind(now)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("mark workspace_admin_stats_dirty: {e}")))?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit create_workspace: {e}")))?;

    let _ = self
      .invalidation
      .publish_invalidation(&InvalidationHintV1::WorkspaceInventoryChanged {
        workspace_id: workspace_id.clone(),
        doc_id: None,
      })
      .await;

    Ok(WorkspaceRecord {
      id: workspace_id,
      sid,
      name: name.map(str::to_owned),
      avatar_key: None,
      public: false,
      enable_ai: true,
      enable_doc_embedding: true,
      enable_sharing: true,
      enable_url_preview: false,
      indexed: false,
      created_at: now,
      last_check_embeddings: epoch,
    })
  }

  pub async fn get_workspace_for_user(
    &self,
    workspace_id: &str,
    user_id: Option<&str>,
  ) -> Result<WorkspaceRecord, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire get_workspace_for_user: {e}")))?;

    let row = sqlx::query(
      r#"SELECT w.id, w.sid, w.name, w.avatar_key, w.enable_ai, w.enable_doc_embedding,
                w.indexed, w.created_at, w.last_check_embeddings,
                COALESCE(p.visibility = 'public', false) AS is_public,
                COALESCE(p.sharing_enabled, true) AS enable_sharing,
                COALESCE(p.url_preview_enabled, false) AS enable_url_preview
         FROM workspaces w
         LEFT JOIN workspace_access_policies p ON p.workspace_id = w.id
         WHERE w.id = $1"#,
    )
    .bind(workspace_id)
    .fetch_optional(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("load workspace: {e}")))?
    .ok_or_else(|| DomainError::NotFound(format!("workspace {workspace_id} not found")))?;

    let workspace = row_to_workspace(row);
    if !(workspace.public && workspace.enable_sharing) {
      let Some(uid) = user_id else {
        return Err(DomainError::Unauthorized("authentication required".to_owned()));
      };
      let is_member: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active')",
      )
      .bind(workspace_id)
      .bind(uid)
      .fetch_one(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("check workspace membership: {e}")))?;
      if !is_member {
        return Err(DomainError::Forbidden("workspace access denied".to_owned()));
      }
    }

    Ok(workspace)
  }

  /// Authorizes a workspace write/management operation strictly by active
  /// membership, NEVER bypassing membership checks for `public == true`
  /// workspaces. Returns `NotFound` if the workspace does not exist and
  /// `Forbidden` if `user_id` is not an active member.
  pub async fn require_active_member_role(
    &self,
    workspace_id: &str,
    user_id: &str,
  ) -> Result<WorkspaceRole, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire require_active_member_role: {e}")))?;

    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1)")
      .bind(workspace_id)
      .fetch_one(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("check workspace exists: {e}")))?;
    if !exists {
      return Err(DomainError::NotFound(format!("workspace {workspace_id} not found")));
    }

    let role: Option<String> = sqlx::query_scalar(
      "SELECT role::text FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active' LIMIT 1",
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_optional(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("load workspace member role: {e}")))?;

    let Some(role_str) = role else {
      return Err(DomainError::Forbidden("workspace write access denied".to_owned()));
    };
    WorkspaceRole::parse(&role_str)
  }

  pub async fn list_user_workspaces(&self, user_id: &str) -> Result<Vec<WorkspaceRecord>, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire list_user_workspaces: {e}")))?;

    let rows = sqlx::query(
      r#"SELECT w.id, w.sid, w.name, w.avatar_key, w.enable_ai, w.enable_doc_embedding,
                w.indexed, w.created_at, w.last_check_embeddings,
                COALESCE(p.visibility = 'public', false) AS is_public,
                COALESCE(p.sharing_enabled, true) AS enable_sharing,
                COALESCE(p.url_preview_enabled, false) AS enable_url_preview
         FROM workspaces w
         JOIN workspace_members m ON m.workspace_id = w.id
         LEFT JOIN workspace_access_policies p ON p.workspace_id = w.id
         WHERE m.user_id = $1 AND m.state = 'active'
         ORDER BY w.sid ASC"#,
    )
    .bind(user_id)
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("list user workspaces: {e}")))?;

    Ok(rows.into_iter().map(row_to_workspace).collect())
  }

  pub async fn update_workspace(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    input: UpdateWorkspaceInput,
  ) -> Result<WorkspaceRecord, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin update_workspace: {e}")))?;

    lock_workspace_row(tx.tx_mut(), workspace_id).await?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load update_workspace time: {e}")))?;
    let actor_role = require_active_member_role(tx.tx_mut(), workspace_id, actor_user_id).await?;
    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, now)
      .await?;
    let effective_actor_role = actor_role.effective(grant.rights.commercial);
    if !matches!(effective_actor_role, WorkspaceRole::Owner | WorkspaceRole::Admin) {
      return Err(DomainError::Forbidden(
        "only workspace owner or commercial admin may update workspace".to_owned(),
      ));
    }

    if let Some(name) = input.name {
      sqlx::query("UPDATE workspaces SET name = $2 WHERE id = $1")
        .bind(workspace_id)
        .bind(name)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("update workspace name: {e}")))?;
    }
    if let Some(avatar_key) = input.avatar_key {
      sqlx::query("UPDATE workspaces SET avatar_key = $2 WHERE id = $1")
        .bind(workspace_id)
        .bind(avatar_key)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("update workspace avatar_key: {e}")))?;
    }
    if let Some(enable_ai) = input.enable_ai {
      sqlx::query("UPDATE workspaces SET enable_ai = $2 WHERE id = $1")
        .bind(workspace_id)
        .bind(enable_ai)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("update workspace enable_ai: {e}")))?;
    }
    if let Some(enable_doc_embedding) = input.enable_doc_embedding {
      sqlx::query("UPDATE workspaces SET enable_doc_embedding = $2 WHERE id = $1")
        .bind(workspace_id)
        .bind(enable_doc_embedding)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("update workspace enable_doc_embedding: {e}")))?;
    }

    if input.public.is_some() || input.enable_sharing.is_some() || input.enable_url_preview.is_some() {
      let visibility = input.public.map(|p| if p { "public" } else { "private" });
      sqlx::query(
        r#"INSERT INTO workspace_access_policies
             (workspace_id, visibility, sharing_enabled, url_preview_enabled, member_default_doc_role, created_at, updated_at)
           VALUES ($1, COALESCE($2, 'private'), COALESCE($3, true), COALESCE($4, false), 'manager', clock_timestamp(), clock_timestamp())
           ON CONFLICT (workspace_id) DO UPDATE SET
             visibility = COALESCE($2, workspace_access_policies.visibility),
             sharing_enabled = COALESCE($3, workspace_access_policies.sharing_enabled),
             url_preview_enabled = COALESCE($4, workspace_access_policies.url_preview_enabled),
             updated_at = clock_timestamp()"#,
      )
      .bind(workspace_id)
      .bind(visibility)
      .bind(input.enable_sharing)
      .bind(input.enable_url_preview)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("upsert workspace_access_policies: {e}")))?;
    }

    let row = sqlx::query(
      r#"SELECT w.id, w.sid, w.name, w.avatar_key, w.enable_ai, w.enable_doc_embedding,
                w.indexed, w.created_at, w.last_check_embeddings,
                COALESCE(p.visibility = 'public', false) AS is_public,
                COALESCE(p.sharing_enabled, true) AS enable_sharing,
                COALESCE(p.url_preview_enabled, false) AS enable_url_preview
         FROM workspaces w
         LEFT JOIN workspace_access_policies p ON p.workspace_id = w.id
         WHERE w.id = $1"#,
    )
    .bind(workspace_id)
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("reload updated workspace: {e}")))?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit update_workspace: {e}")))?;

    Ok(row_to_workspace(row))
  }

  /// Invites a user by email to a workspace. Locks `workspaces FOR UPDATE`
  /// before calling [`QuotaGate::check_seat_admission`] so concurrent invites
  /// can never exceed the workspace's seat limit.
  pub async fn invite_member(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    invitee_email: &str,
    requested_role: WorkspaceRole,
  ) -> Result<WorkspaceInvitationRecord, DomainError> {
    self
      .invite_member_with_source(actor_user_id, workspace_id, invitee_email, requested_role, None)
      .await
  }

  /// Invites a user by email to a workspace while forwarding optional request
  /// source metadata to [`RateLimitPolicy::check_workspace_invite`].
  pub async fn invite_member_with_source(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    invitee_email: &str,
    requested_role: WorkspaceRole,
    source: Option<&RequestSource>,
  ) -> Result<WorkspaceInvitationRecord, DomainError> {
    let mut batch = self
      .invite_members_with_source(
        actor_user_id,
        workspace_id,
        &[invitee_email.to_owned()],
        requested_role,
        source,
      )
      .await?;
    batch
      .pop()
      .map(|(_, res)| res)
      .unwrap_or_else(|| Err(DomainError::Internal("empty invite batch result".to_owned())))
  }

  /// Invites a batch of emails to a workspace in a single transaction,
  /// invoking [`RateLimitPolicy::check_workspace_invite`] once with the full
  /// valid candidate list (matching `v0.27.5` `inviteMembers` batch semantics).
  pub async fn invite_members_with_source(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    invitee_emails: &[String],
    requested_role: WorkspaceRole,
    source: Option<&RequestSource>,
  ) -> Result<Vec<(String, Result<WorkspaceInvitationRecord, DomainError>)>, DomainError> {
    const MAX_INVITE_BATCH_LEN: usize = 512;

    if requested_role == WorkspaceRole::Owner {
      return Err(DomainError::Validation("cannot invite directly as owner".to_owned()));
    }

    // compat(parity): workspace-invite-0275-preflight-order -- preserves v0.27.5 batch invite preflight validation order
    // 1. Pre-flight read gate (matching `v0.27.5` `member.ts:98-105, 179-199`):
    //    verify workspace existence, actor authorization (even for empty or
    //    oversized batches), workspace name domain policy, and the 512 batch
    //    cap BEFORE looking up or locking any invitee `users` rows.
    {
      let mut read_tx = self
        .db
        .begin_tiered(WorkloadTier::InteractiveRead)
        .await
        .map_err(|e| DomainError::Internal(format!("begin invite_members preflight: {e}")))?;

      let workspace_name: Option<String> = sqlx::query_scalar("SELECT name FROM workspaces WHERE id = $1")
        .bind(workspace_id)
        .fetch_optional(&mut **read_tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("load workspace for invite preflight: {e}")))?
        .ok_or_else(|| DomainError::NotFound(format!("workspace {workspace_id} not found")))?;

      let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
        .fetch_one(&mut **read_tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("load invite preflight time: {e}")))?;

      let actor_role = require_active_member_role(read_tx.tx_mut(), workspace_id, actor_user_id).await?;
      let grant = self
        .quota_gate
        .resolve_workspace_grant(read_tx.tx_mut(), workspace_id, now)
        .await?;
      let effective_actor_role = actor_role.effective(grant.rights.commercial);
      if !matches!(effective_actor_role, WorkspaceRole::Owner | WorkspaceRole::Admin) {
        return Err(DomainError::Forbidden(
          "only workspace owner or commercial admin may invite members".to_owned(),
        ));
      }

      if let Some(name) = workspace_name.as_deref()
        && crate::content_policy::contains_url_or_domain(name)
      {
        return Err(DomainError::Forbidden(
          "Workspace names containing links or domains cannot be used to invite members.".to_owned(),
        ));
      }

      read_tx
        .commit()
        .await
        .map_err(|e| DomainError::Internal(format!("commit invite_members preflight: {e}")))?;
    }

    if invitee_emails.len() > MAX_INVITE_BATCH_LEN {
      return Err(DomainError::RateLimited("Too many requests.".to_owned()));
    }
    if invitee_emails.is_empty() {
      return Ok(Vec::new());
    }

    // `workspace_invitations.normalized_email` must always be stored lowercase so
    // `v0.27.5` `strict_quota/seat.rs` literal equality checks (`normalized_email = $3`)
    // match during mixed-version deployments.
    let mut slots: Vec<Option<Result<WorkspaceInvitationRecord, DomainError>>> =
      (0..invitee_emails.len()).map(|_| None).collect();
    let mut seen_emails = std::collections::HashSet::with_capacity(invitee_emails.len());
    let mut valid_inputs: Vec<(usize, String)> = Vec::with_capacity(invitee_emails.len());

    for (idx, raw) in invitee_emails.iter().enumerate() {
      match canonical_email(raw) {
        Ok(canon) => {
          let lower = canon.to_ascii_lowercase();
          if !seen_emails.insert(lower.clone()) {
            slots[idx] = Some(Err(DomainError::Forbidden("Duplicate invite email.".to_owned())));
          } else {
            valid_inputs.push((idx, lower));
          }
        }
        Err(err) => {
          slots[idx] = Some(Err(err));
        }
      }
    }

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin invite_members: {e}")))?;

    // Deadlock-free lock order matching `accept_invitation`, `users.rs`, & `v0.27.5` `strict_quota/seat.rs`:
    // 1) lock sorted normalized invitee emails via advisory lock
    // 2) lock sorted `users` (`owner_id`, `actor_user_id`, all matched `invitee_user_id`s)
    // 3) lock `workspaces`
    // 4) re-verify `owner_id`, workspace name, & `invitee_user_id` stability under locks.
    let mut sorted_emails: Vec<&str> = valid_inputs.iter().map(|(_, e)| e.as_str()).collect();
    sorted_emails.sort_unstable();
    sorted_emails.dedup();
    for email in sorted_emails {
      crate::users::lock_email_in_tx(tx.tx_mut(), email).await?;
    }

    let owner_id: String = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND role = 'owner' AND state = 'active' LIMIT 1",
    )
    .bind(workspace_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("locate workspace owner for invite: {e}")))?
    .ok_or_else(|| DomainError::NotFound(format!("workspace {workspace_id} not found")))?;

    let mut initial_user_map: std::collections::BTreeMap<String, Option<String>> = std::collections::BTreeMap::new();
    for (_, email) in &valid_inputs {
      let uid: Option<String> =
        sqlx::query_scalar("SELECT id FROM users WHERE lower(email) = lower($1) ORDER BY id LIMIT 1")
          .bind(email)
          .fetch_optional(&mut **tx.tx_mut())
          .await
          .map_err(|e| DomainError::Internal(format!("lookup invitee user: {e}")))?;
      initial_user_map.insert(email.clone(), uid);
    }

    let mut users_to_lock = vec![owner_id.clone(), actor_user_id.to_owned()];
    for uid in initial_user_map.values().flatten() {
      users_to_lock.push(uid.clone());
    }
    users_to_lock.sort();
    users_to_lock.dedup();
    sqlx::query("SELECT id FROM users WHERE id = ANY($1) ORDER BY id FOR UPDATE")
      .bind(&users_to_lock)
      .fetch_all(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock invite_members users: {e}")))?;

    lock_workspace_row(tx.tx_mut(), workspace_id).await?;

    // Re-check workspace name and actor invite permission under row locks to prevent TOCTOU races.
    let locked_workspace_name: Option<String> = sqlx::query_scalar("SELECT name FROM workspaces WHERE id = $1")
      .bind(workspace_id)
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("reload locked workspace name for invite: {e}")))?;
    if let Some(name) = locked_workspace_name.as_deref()
      && crate::content_policy::contains_url_or_domain(name)
    {
      return Err(DomainError::Forbidden(
        "Workspace names containing links or domains cannot be used to invite members.".to_owned(),
      ));
    }

    let locked_owner_id: String = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND role = 'owner' AND state = 'active' LIMIT 1",
    )
    .bind(workspace_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("verify locked workspace owner for invite: {e}")))?
    .ok_or_else(|| DomainError::NotFound(format!("workspace {workspace_id} not found")))?;
    if locked_owner_id != owner_id {
      return Err(DomainError::Conflict("workspace owner changed".to_owned()));
    }

    let mut locked_user_map: std::collections::BTreeMap<String, Option<String>> = std::collections::BTreeMap::new();
    for (_, email) in &valid_inputs {
      let uid: Option<String> =
        sqlx::query_scalar("SELECT id FROM users WHERE lower(email) = lower($1) ORDER BY id LIMIT 1")
          .bind(email)
          .fetch_optional(&mut **tx.tx_mut())
          .await
          .map_err(|e| DomainError::Internal(format!("recheck invitee user: {e}")))?;
      if initial_user_map.get(email).and_then(|v| v.as_deref()) != uid.as_deref() {
        return Err(DomainError::Conflict("invitee user changed".to_owned()));
      }
      locked_user_map.insert(email.clone(), uid);
    }

    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load invite decision time: {e}")))?;

    let actor_role = require_active_member_role(tx.tx_mut(), workspace_id, actor_user_id).await?;
    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, now)
      .await?;
    let effective_actor_role = actor_role.effective(grant.rights.commercial);
    if !matches!(effective_actor_role, WorkspaceRole::Owner | WorkspaceRole::Admin) {
      return Err(DomainError::Forbidden(
        "only workspace owner or commercial admin may invite members".to_owned(),
      ));
    }

    let mut candidates: Vec<(usize, String, Option<String>)> = Vec::with_capacity(valid_inputs.len());
    for (idx, email) in valid_inputs {
      let invitee_user_id = locked_user_map.get(&email).cloned().flatten();
      if let Some(uid) = invitee_user_id.as_deref() {
        let already_member: bool = sqlx::query_scalar(
          "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active')",
        )
        .bind(workspace_id)
        .bind(uid)
        .fetch_one(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("check existing workspace member: {e}")))?;
        if already_member {
          slots[idx] = Some(Err(DomainError::Conflict(
            "user is already a workspace member".to_owned(),
          )));
          continue;
        }
      }

      let duplicate_invite: bool = sqlx::query_scalar(
        "SELECT EXISTS(
           SELECT 1
           FROM workspace_invitations
           WHERE workspace_id = $1
             AND (lower(normalized_email) = lower($2) OR ($3::text IS NOT NULL AND invitee_user_id = $3))
             AND status::text = ANY($4)
         )",
      )
      .bind(workspace_id)
      .bind(&email)
      .bind(invitee_user_id.as_deref())
      .bind(CHARGEABLE_INVITATION_STATUSES.as_slice())
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("check duplicate workspace invitation: {e}")))?;
      if duplicate_invite {
        slots[idx] = Some(Err(DomainError::Conflict(
          "pending invitation already exists".to_owned(),
        )));
        continue;
      }

      candidates.push((idx, email, invitee_user_id));
    }

    if !candidates.is_empty() {
      let candidate_refs: Vec<&str> = candidates.iter().map(|(_, e, _)| e.as_str()).collect();
      if let Err(rejection) = self
        .rate_limit_policy
        .check_workspace_invite(tx.tx_mut(), workspace_id, actor_user_id, &candidate_refs, source, now)
        .await
      {
        tx.rollback()
          .await
          .map_err(|e| DomainError::Internal(format!("rollback rejected workspace invite: {e}")))?;
        return Err(rejection.apply_post_rollback().await?);
      }

      let current_charged_seats = count_charged_seats_in_tx(tx.tx_mut(), workspace_id).await?;
      self
        .quota_gate
        .check_seat_admission(
          tx.tx_mut(),
          workspace_id,
          current_charged_seats,
          candidates.len() as i32,
          now,
        )
        .await?;

      let mut notified_invitees: Vec<String> = Vec::new();
      for (idx, email, mut invitee_user_id) in candidates {
        if invitee_user_id.is_none() {
          let placeholder_id = Uuid::new_v4().to_string();
          let placeholder_name = email
            .split('@')
            .next()
            .filter(|s| !s.is_empty())
            .unwrap_or("Invited user");
          let created_id: String = sqlx::query_scalar(
            r#"INSERT INTO users (id, name, email, registered, created_at)
               VALUES ($1, $2, $3, false, clock_timestamp())
               RETURNING id"#,
          )
          .bind(&placeholder_id)
          .bind(placeholder_name)
          .bind(&email)
          .fetch_one(&mut **tx.tx_mut())
          .await
          .map_err(|e| DomainError::Internal(format!("create placeholder invitee user: {e}")))?;
          invitee_user_id = Some(created_id);
        }

        // Clear any stale non-chargeable invitations for this target so the
        // `(workspace_id, invitee_user_id)` unique constraint never collides on re-invite.
        sqlx::query(
          "DELETE FROM workspace_invitations
           WHERE workspace_id = $1
             AND (lower(normalized_email) = lower($2) OR ($3::text IS NOT NULL AND invitee_user_id = $3))
             AND NOT (status::text = ANY($4))",
        )
        .bind(workspace_id)
        .bind(&email)
        .bind(invitee_user_id.as_deref())
        .bind(CHARGEABLE_INVITATION_STATUSES.as_slice())
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("clear stale workspace invitations: {e}")))?;

        let invitation_id = format!("inv_{}", Uuid::new_v4().simple());
        sqlx::query(
          r#"INSERT INTO workspace_invitations
               (id, workspace_id, invitee_user_id, normalized_email, inviter_user_id, requested_role, status, kind, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'email', $7, $7)"#,
        )
        .bind(&invitation_id)
        .bind(workspace_id)
        .bind(invitee_user_id.as_deref())
        .bind(&email)
        .bind(actor_user_id)
        .bind(requested_role.as_str())
        .bind(now)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("insert workspace invitation: {e}")))?;

        if let Some(ref uid) = invitee_user_id {
          crate::notifications::insert_invitation_notification_with_key_in_tx(
            tx.tx_mut(),
            uid,
            actor_user_id,
            workspace_id,
            &invitation_id,
            "Invitation",
            &self.base_url,
            &self.private_key,
          )
          .await?;
          notified_invitees.push(uid.clone());
        }

        slots[idx] = Some(Ok(WorkspaceInvitationRecord {
          id: invitation_id,
          workspace_id: workspace_id.to_owned(),
          invitee_user_id,
          normalized_email: Some(email),
          inviter_user_id: Some(actor_user_id.to_owned()),
          requested_role,
          status: "pending".to_owned(),
          created_at: now,
        }));
      }

      tx.commit()
        .await
        .map_err(|e| DomainError::Internal(format!("commit invite_members: {e}")))?;

      for uid in notified_invitees {
        crate::notifications::publish_notification_count_changed(&self.db, self.event_bus.as_ref(), &uid, "created")
          .await;
      }

      let _ = self
        .invalidation
        .publish_invalidation(&InvalidationHintV1::QuotaSeatUsage {
          workspace_id: workspace_id.to_owned(),
        })
        .await;
      self.notify_billing_members_changed(workspace_id).await;
    }

    Ok(
      invitee_emails
        .iter()
        .cloned()
        .zip(
          slots
            .into_iter()
            .map(|slot| slot.unwrap_or_else(|| Err(DomainError::Internal("missing invite slot result".to_owned())))),
        )
        .collect(),
    )
  }

  /// Accepts a pending workspace invitation or joins via an active workspace
  /// invite link (`workspace:inviteLinkId:<id>`), following the exact `v0.27.5`
  /// `strict_quota/seat.rs` deadlock-free lock order.
  pub async fn accept_invitation(
    &self,
    invitee_user_id: &str,
    invitation_id: &str,
  ) -> Result<WorkspaceMemberRecord, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin accept_invitation: {e}")))?;

    let maybe_inv_workspace_id: Option<String> =
      sqlx::query_scalar("SELECT workspace_id FROM workspace_invitations WHERE id = $1")
        .bind(invitation_id)
        .fetch_optional(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("load invitation workspace: {e}")))?;

    let Some(inv_workspace_id) = maybe_inv_workspace_id else {
      drop(tx);
      return self.accept_invite_link(invitee_user_id, invitation_id).await;
    };

    let owner_id: String = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND role = 'owner' AND state = 'active' LIMIT 1",
    )
    .bind(&inv_workspace_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("locate workspace owner for accept: {e}")))?
    .ok_or_else(|| DomainError::NotFound("workspace owner not found".to_owned()))?;

    let mut users_to_lock = vec![owner_id.clone(), invitee_user_id.to_owned()];
    users_to_lock.sort();
    users_to_lock.dedup();
    sqlx::query("SELECT id FROM users WHERE id = ANY($1) ORDER BY id FOR UPDATE")
      .bind(&users_to_lock)
      .fetch_all(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock accept_invitation users: {e}")))?;

    lock_workspace_row(tx.tx_mut(), &inv_workspace_id).await?;

    let locked_owner_id: String = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND role = 'owner' AND state = 'active' LIMIT 1",
    )
    .bind(&inv_workspace_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("verify locked workspace owner: {e}")))?
    .ok_or_else(|| DomainError::NotFound("workspace owner not found".to_owned()))?;
    if locked_owner_id != owner_id {
      return Err(DomainError::Conflict("workspace owner changed".to_owned()));
    }

    let inv_row = sqlx::query(
      r#"SELECT id, workspace_id, invitee_user_id, inviter_user_id, normalized_email,
                requested_role::text AS requested_role,
                kind::text AS kind,
                status::text AS status,
                expires_at
         FROM workspace_invitations
         WHERE id = $1
         FOR UPDATE"#,
    )
    .bind(invitation_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("lock invitation: {e}")))?
    .ok_or_else(|| DomainError::NotFound("invitation not found".to_owned()))?;

    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load accept timestamp: {e}")))?;

    let status: String = inv_row.get("status");
    if status != "pending" {
      return Err(DomainError::Conflict(format!(
        "invitation is not pending (status={status})"
      )));
    }
    let expires_at: Option<DateTime<Utc>> = inv_row.get("expires_at");
    if expires_at.is_some_and(|exp| exp <= now) {
      return Err(DomainError::Forbidden("invitation has expired".to_owned()));
    }

    let role_str: String = inv_row.get("requested_role");
    let role = WorkspaceRole::parse(&role_str)?;
    if role == WorkspaceRole::Owner {
      return Err(DomainError::Forbidden(
        "cannot accept owner role via invitation".to_owned(),
      ));
    }

    let inv_uid: Option<String> = inv_row.get("invitee_user_id");
    let inv_email: Option<String> = inv_row.get("normalized_email");
    let matches_user = if let Some(bound_uid) = inv_uid.as_deref() {
      bound_uid == invitee_user_id
    } else {
      let user_email: String = sqlx::query_scalar("SELECT lower(email) FROM users WHERE id = $1")
        .bind(invitee_user_id)
        .fetch_optional(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("load invitee email: {e}")))?
        .ok_or_else(|| DomainError::NotFound("user not found".to_owned()))?;
      inv_email
        .as_deref()
        .is_some_and(|e| e.eq_ignore_ascii_case(&user_email))
    };
    if !matches_user {
      return Err(DomainError::Forbidden("invitation does not belong to user".to_owned()));
    }

    let already_member: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active')",
    )
    .bind(&inv_workspace_id)
    .bind(invitee_user_id)
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("check existing member on accept: {e}")))?;
    if already_member {
      return Err(DomainError::Conflict("user is already a workspace member".to_owned()));
    }

    let current_charged_excluding_this = (count_charged_seats_in_tx(tx.tx_mut(), &inv_workspace_id).await? - 1).max(0);
    self
      .quota_gate
      .check_seat_admission(tx.tx_mut(), &inv_workspace_id, current_charged_excluding_this, 1, now)
      .await?;

    let source: String = inv_row.get("kind");
    let inserted = sqlx::query(
      r#"INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'active', $5, $6, $6)
         ON CONFLICT (workspace_id, user_id, state) DO NOTHING"#,
    )
    .bind(invitation_id)
    .bind(&inv_workspace_id)
    .bind(invitee_user_id)
    .bind(role.as_str())
    .bind(&source)
    .bind(now)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("insert accepted workspace member: {e}")))?;
    if inserted.rows_affected() != 1 {
      return Err(DomainError::Conflict("workspace_member_conflict".to_owned()));
    }

    let consumed = sqlx::query("DELETE FROM workspace_invitations WHERE id = $1")
      .bind(invitation_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("consume accepted workspace invitation: {e}")))?;
    if consumed.rows_affected() != 1 {
      return Err(DomainError::Conflict("workspace_invitation_changed".to_owned()));
    }

    let inviter_user_id: Option<String> = inv_row.get("inviter_user_id");
    if let Some(ref inviter_id) = inviter_user_id
      && inviter_id != invitee_user_id
    {
      crate::notifications::insert_invitation_notification_with_key_in_tx(
        tx.tx_mut(),
        inviter_id,
        invitee_user_id,
        &inv_workspace_id,
        invitation_id,
        "InvitationAccepted",
        &self.base_url,
        &self.private_key,
      )
      .await?;
    }

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit accept_invitation: {e}")))?;

    if let Some(ref inviter_id) = inviter_user_id
      && inviter_id != invitee_user_id
    {
      crate::notifications::publish_notification_count_changed(
        &self.db,
        self.event_bus.as_ref(),
        inviter_id,
        "created",
      )
      .await;
    }

    let _ = self
      .invalidation
      .publish_invalidation(&InvalidationHintV1::QuotaSeatUsage {
        workspace_id: inv_workspace_id.clone(),
      })
      .await;
    self.notify_billing_members_changed(&inv_workspace_id).await;

    Ok(WorkspaceMemberRecord {
      id: invitation_id.to_owned(),
      workspace_id: inv_workspace_id,
      user_id: invitee_user_id.to_owned(),
      role,
      state: "active".to_owned(),
      source,
      created_at: now,
      updated_at: now,
    })
  }

  /// Updates an active workspace member's role (Admin or Member). Ownership
  /// transfers must go through [`Self::transfer_workspace_ownership`].
  pub async fn update_member_role(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    target_user_id: &str,
    new_role: WorkspaceRole,
  ) -> Result<WorkspaceMemberRecord, DomainError> {
    if new_role == WorkspaceRole::Owner {
      return Err(DomainError::Forbidden(
        "use transferWorkspaceOwnership to transfer workspace ownership".to_owned(),
      ));
    }

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin update_member_role: {e}")))?;

    lock_workspace_row(tx.tx_mut(), workspace_id).await?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load update_member_role time: {e}")))?;
    let actor_role = require_active_member_role(tx.tx_mut(), workspace_id, actor_user_id).await?;
    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, now)
      .await?;
    if !grant.rights.commercial {
      return Err(DomainError::Forbidden(
        "commercial entitlement required to change member role".to_owned(),
      ));
    }
    if crate::doc_sharing::DocSharingService::is_workspace_readonly_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      now,
    )
    .await?
    {
      return Err(DomainError::Forbidden(
        "workspace is readonly and cannot change member role".to_owned(),
      ));
    }
    let effective_actor_role = actor_role.effective(grant.rights.commercial);
    if !matches!(effective_actor_role, WorkspaceRole::Owner | WorkspaceRole::Admin) {
      return Err(DomainError::Forbidden(
        "insufficient permissions to change member role".to_owned(),
      ));
    }
    if new_role == WorkspaceRole::Owner {
      return Err(DomainError::Forbidden("workspace_owner_must_transfer".to_owned()));
    }

    let active_target_role: Option<String> = sqlx::query_scalar(
      "SELECT role::text FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active' FOR UPDATE",
    )
    .bind(workspace_id)
    .bind(target_user_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load target member role: {e}")))?;

    if let Some(target_role_str) = active_target_role {
      let target_role = WorkspaceRole::parse(&target_role_str)?;
      if target_role == WorkspaceRole::Owner {
        return Err(DomainError::Forbidden("workspace_owner_must_transfer".to_owned()));
      }
      if effective_actor_role == WorkspaceRole::Admin && target_role == WorkspaceRole::Admin {
        return Err(DomainError::Forbidden(
          "admin cannot modify another admin's role".to_owned(),
        ));
      }

      let row = sqlx::query(
        r#"UPDATE workspace_members
           SET role = $3, updated_at = clock_timestamp()
           WHERE workspace_id = $1 AND user_id = $2 AND state = 'active'
           RETURNING id, workspace_id, user_id, role, state, source, created_at, updated_at"#,
      )
      .bind(workspace_id)
      .bind(target_user_id)
      .bind(new_role.as_str())
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("update workspace member role: {e}")))?;

      if target_role != new_role {
        let mail_name = match new_role {
          WorkspaceRole::Admin => Some("TeamBecomeAdmin"),
          WorkspaceRole::Member => Some("TeamBecomeCollaborator"),
          WorkspaceRole::Owner => None,
        };
        if let Some(mail_name) = mail_name {
          let ws_name = load_workspace_display_name_for_mail(tx.tx_mut(), workspace_id).await?;
          let base = self.base_url.trim_end_matches('/');
          let url = format!("{base}/workspace/{workspace_id}");
          crate::notifications::enqueue_notification_mail_in_tx(
            tx.tx_mut(),
            crate::notifications::EnqueueNotificationMail {
              private_key: &self.private_key,
              mail_name,
              mail_class: "workspace_lifecycle",
              recipient_user_id: target_user_id,
              actor_user_id: Some(actor_user_id),
              workspace_id: Some(workspace_id),
              notification_id: None,
              pref_field: None,
              props: serde_json::json!({
                "workspace": { "name": ws_name },
                "url": url,
              }),
              skip_if_domain_in_workspace_name: None,
            },
          )
          .await?;
        }
      }

      tx.commit()
        .await
        .map_err(|e| DomainError::Internal(format!("commit update_member_role: {e}")))?;
      self
        .publish_workspace_members_changed(workspace_id, "member-role-changed")
        .await;

      return Ok(WorkspaceMemberRecord {
        id: row.get("id"),
        workspace_id: row.get("workspace_id"),
        user_id: row.get("user_id"),
        role: WorkspaceRole::parse(&row.get::<String, _>("role"))?,
        state: row.get("state"),
        source: row.get("source"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
      });
    }

    let inv_row = sqlx::query(
      r#"SELECT id, invitee_user_id, requested_role::text AS requested_role, status::text AS status, kind::text AS kind
         FROM workspace_invitations
         WHERE workspace_id = $1
           AND (invitee_user_id = $2 OR id = $2)
           AND status::text IN ('pending', 'waiting_review')
         FOR UPDATE"#,
    )
    .bind(workspace_id)
    .bind(target_user_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load target invitation role: {e}")))?;

    let Some(inv) = inv_row else {
      return Err(DomainError::Forbidden(format!(
        "member_not_found_in_space:{workspace_id}"
      )));
    };
    let inv_id: String = inv.get("id");
    let current_inv_role = WorkspaceRole::parse(&inv.get::<String, _>("requested_role"))?;
    if effective_actor_role == WorkspaceRole::Admin && current_inv_role == WorkspaceRole::Admin {
      return Err(DomainError::Forbidden(
        "admin cannot modify another admin's role".to_owned(),
      ));
    }

    let updated = sqlx::query(
      r#"UPDATE workspace_invitations
         SET requested_role = $2, updated_at = clock_timestamp()
         WHERE id = $1
         RETURNING id, workspace_id, COALESCE(invitee_user_id, id) AS user_id,
                   requested_role::text AS role, status::text AS state, kind::text AS source,
                   created_at, updated_at"#,
    )
    .bind(&inv_id)
    .bind(new_role.as_str())
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("update workspace invitation role: {e}")))?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit update_member_role invitation: {e}")))?;
    self
      .publish_workspace_members_changed(workspace_id, "member-role-changed")
      .await;

    Ok(WorkspaceMemberRecord {
      id: updated.get("id"),
      workspace_id: updated.get("workspace_id"),
      user_id: updated.get("user_id"),
      role: WorkspaceRole::parse(&updated.get::<String, _>("role"))?,
      state: updated.get("state"),
      source: updated.get("source"),
      created_at: updated.get("created_at"),
      updated_at: updated.get("updated_at"),
    })
  }

  /// Revokes a workspace member or pending invitation, enforcing owner
  /// protection and self-revoke restrictions matching `domain_command/members.rs`.
  pub async fn revoke_member(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    target_user_id: &str,
  ) -> Result<(), DomainError> {
    if actor_user_id == target_user_id {
      return Err(DomainError::Forbidden("cannot_revoke_self".to_owned()));
    }

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin revoke_member: {e}")))?;

    lock_workspace_row(tx.tx_mut(), workspace_id).await?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load revoke_member time: {e}")))?;
    let actor_role = require_active_member_role(tx.tx_mut(), workspace_id, actor_user_id).await?;
    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, now)
      .await?;
    let effective_actor_role = actor_role.effective(grant.rights.commercial);
    if !matches!(effective_actor_role, WorkspaceRole::Owner | WorkspaceRole::Admin) {
      return Err(DomainError::Forbidden(
        "insufficient permissions to revoke member".to_owned(),
      ));
    }

    let target_member_role: Option<String> = sqlx::query_scalar(
      "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active' FOR UPDATE",
    )
    .bind(workspace_id)
    .bind(target_user_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("lock target member: {e}")))?;

    if let Some(role_str) = target_member_role {
      let target_role = WorkspaceRole::parse(&role_str)?;
      if target_role == WorkspaceRole::Owner {
        return Err(DomainError::Forbidden("workspace_owner_must_transfer".to_owned()));
      }
      if effective_actor_role == WorkspaceRole::Admin && target_role == WorkspaceRole::Admin {
        return Err(DomainError::Forbidden("admin cannot revoke another admin".to_owned()));
      }
    }

    let deleted_members =
      sqlx::query("DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active'")
        .bind(workspace_id)
        .bind(target_user_id)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("delete workspace member: {e}")))?
        .rows_affected();

    let target_email: Option<String> = sqlx::query_scalar("SELECT lower(email) FROM users WHERE id = $1")
      .bind(target_user_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load target email for revoke: {e}")))?;

    let deleted_invites_rows = sqlx::query(
      "DELETE FROM workspace_invitations
       WHERE workspace_id = $1
         AND (
           invitee_user_id = $2
           OR (invitee_user_id IS NULL AND $3::text IS NOT NULL AND lower(normalized_email) = lower($3))
         )
       RETURNING id, invitee_user_id, status::text AS status",
    )
    .bind(workspace_id)
    .bind(target_user_id)
    .bind(target_email.as_deref())
    .fetch_all(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("delete workspace invitation: {e}")))?;
    let deleted_invites = deleted_invites_rows.len() as u64;

    if deleted_members == 0 && deleted_invites == 0 {
      return Err(DomainError::NotFound("workspace_member_not_found".to_owned()));
    }

    let mut declined_notify_user: Option<String> = None;
    if deleted_members > 0 {
      let ws_name = load_workspace_display_name_for_mail(tx.tx_mut(), workspace_id).await?;
      crate::notifications::enqueue_notification_mail_in_tx(
        tx.tx_mut(),
        crate::notifications::EnqueueNotificationMail {
          private_key: &self.private_key,
          mail_name: "MemberRemoved",
          mail_class: "workspace_lifecycle",
          recipient_user_id: target_user_id,
          actor_user_id: Some(actor_user_id),
          workspace_id: Some(workspace_id),
          notification_id: None,
          pref_field: None,
          props: serde_json::json!({ "workspace": { "name": ws_name } }),
          skip_if_domain_in_workspace_name: None,
        },
      )
      .await?;
    } else {
      for inv in &deleted_invites_rows {
        let status: String = inv.get("status");
        if status == "waiting_review"
          && let Some(uid) = inv.get::<Option<String>, _>("invitee_user_id")
        {
          let inv_id: String = inv.get("id");
          crate::notifications::insert_invitation_notification_with_key_in_tx(
            tx.tx_mut(),
            &uid,
            actor_user_id,
            workspace_id,
            &inv_id,
            "InvitationReviewDeclined",
            &self.base_url,
            &self.private_key,
          )
          .await?;
          declined_notify_user = Some(uid);
        }
      }
    }

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit revoke_member: {e}")))?;

    if let Some(uid) = declined_notify_user {
      crate::notifications::publish_notification_count_changed(&self.db, self.event_bus.as_ref(), &uid, "created")
        .await;
    }

    for hint in [
      InvalidationHintV1::QuotaSeatUsage {
        workspace_id: workspace_id.to_owned(),
      },
      InvalidationHintV1::WorkspaceInventoryChanged {
        workspace_id: workspace_id.to_owned(),
        doc_id: None,
      },
    ] {
      let _ = self.invalidation.publish_invalidation(&hint).await;
    }
    self.notify_billing_members_changed(workspace_id).await;

    Ok(())
  }

  pub async fn is_workspace_initialized(&self, workspace_id: &str) -> Result<bool, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire is_workspace_initialized: {e}")))?;
    sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM snapshots WHERE workspace_id = $1 AND guid = $1)")
      .bind(workspace_id)
      .fetch_one(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("check workspace initialized: {e}")))
  }

  /// Resolves per-document ACL entry (including alias resolution, deleted state,
  /// published public flag, and all 21 `DocPermissionsView` flags) in one transaction.
  pub async fn resolve_doc_access(
    &self,
    workspace_id: &str,
    actor_user_id: Option<&str>,
    doc_id: &str,
  ) -> Result<crate::acl::DocAccessEntry, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("begin resolve_doc_access: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load resolve_doc_access clock: {e}")))?;
    let snapshot = crate::acl::load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      actor_user_id,
      &[doc_id.to_owned()],
      now,
    )
    .await?;
    let _ = tx.rollback().await;
    snapshot
      .docs
      .into_values()
      .next()
      .ok_or_else(|| DomainError::Internal("missing doc access entry".to_owned()))
  }

  /// Authorizes and loads the merged Yjs binary (`snapshots.blob` + `updates.blob`)
  /// for `GET /api/workspaces/{ws}/docs/{doc_id}` inside a single
  /// `REPEATABLE READ READ ONLY` transaction.
  ///
  /// Returns `Ok(Some((bytes, publish_mode)))` where `publish_mode` is `None`
  /// for the workspace root doc and `Some("edgeless" | "page")` for non-root docs.
  pub async fn get_doc_binary_for_actor(
    &self,
    workspace_id: &str,
    actor_user_id: Option<&str>,
    doc_id: &str,
  ) -> Result<Option<(Vec<u8>, Option<&'static str>)>, DomainError> {
    const MAX_UPDATES: i64 = 10_000;
    const MAX_BYTES: usize = 16 * 1024 * 1024;

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("begin get_doc_binary_for_actor: {e}")))?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("set repeatable read: {e}")))?;

    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load doc read clock: {e}")))?;

    let acl = crate::acl::load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      actor_user_id,
      &[doc_id.to_owned()],
      now,
    )
    .await?;
    let entry = acl
      .docs
      .get(doc_id)
      .ok_or_else(|| DomainError::Internal("missing doc acl entry".to_owned()))?;

    let is_root = entry.storage_doc_id == workspace_id;
    let allowed = if is_root {
      acl.workspace_permissions.read
    } else {
      !entry.deleted && entry.permissions.doc_read
    };
    if !allowed {
      let _ = tx.rollback().await;
      if entry.deleted {
        return Ok(None);
      }
      return if actor_user_id.is_none() {
        Err(DomainError::Unauthorized("Authentication required".to_owned()))
      } else {
        Err(DomainError::Forbidden("Document access denied".to_owned()))
      };
    }

    let storage_doc_id = entry.storage_doc_id.clone();
    let publish_mode = (!is_root).then_some(entry.publish_mode);

    let snapshot_len: Option<i64> =
      sqlx::query_scalar("SELECT octet_length(blob)::bigint FROM snapshots WHERE workspace_id = $1 AND guid = $2")
        .bind(workspace_id)
        .bind(&storage_doc_id)
        .fetch_optional(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("check snapshot size: {e}")))?;

    let (update_count, update_bytes): (i64, i64) = sqlx::query_as(
      "SELECT COUNT(*)::bigint, COALESCE(SUM(octet_length(blob)), 0)::bigint
       FROM (
         SELECT blob FROM updates WHERE workspace_id = $1 AND guid = $2 ORDER BY created_at ASC LIMIT $3
       ) sub",
    )
    .bind(workspace_id)
    .bind(&storage_doc_id)
    .bind(MAX_UPDATES + 1)
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("check updates budget: {e}")))?;

    let total_bytes = snapshot_len.unwrap_or(0).saturating_add(update_bytes);
    if update_count > MAX_UPDATES || total_bytes as usize > MAX_BYTES {
      let _ = tx.rollback().await;
      return Err(DomainError::Validation(
        "document binary exceeds merge budget".to_owned(),
      ));
    }

    let snapshot: Option<Vec<u8>> =
      sqlx::query_scalar("SELECT blob FROM snapshots WHERE workspace_id = $1 AND guid = $2")
        .bind(workspace_id)
        .bind(&storage_doc_id)
        .fetch_optional(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("load doc snapshot bytes: {e}")))?;

    let updates: Vec<Vec<u8>> =
      sqlx::query_scalar("SELECT blob FROM updates WHERE workspace_id = $1 AND guid = $2 ORDER BY created_at ASC")
        .bind(workspace_id)
        .bind(&storage_doc_id)
        .fetch_all(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("load doc updates bytes: {e}")))?;

    let _ = tx.rollback().await;

    let mut buffers = Vec::with_capacity(updates.len() + usize::from(snapshot.is_some()));
    if let Some(snap) = snapshot
      && !snap.is_empty()
    {
      buffers.push(snap);
    }
    for upd in updates {
      if !upd.is_empty() {
        buffers.push(upd);
      }
    }
    if buffers.is_empty() {
      return Ok(None);
    }

    let merged = if buffers.len() == 1 {
      buffers.into_iter().next().unwrap_or_default()
    } else {
      y_octo::merge_updates_v1(&buffers)
        .and_then(|u| u.encode_v1())
        .map_err(|e| DomainError::Internal(format!("merge doc updates: {e}")))?
    };

    Ok(Some((merged, publish_mode)))
  }

  pub async fn is_team_workspace(&self, workspace_id: &str) -> Result<bool, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("begin is_team_workspace: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load is_team_workspace clock: {e}")))?;
    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, now)
      .await?;
    let _ = tx.rollback().await;
    Ok(grant.billing_subject == server_types::BillingSubject::Workspace)
  }

  pub async fn get_workspace_owner(&self, workspace_id: &str) -> Result<crate::users::CurrentUserView, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("begin get_workspace_owner: {e}")))?;
    let owner_id: String = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND role = 'owner' AND state = 'active' LIMIT 1",
    )
    .bind(workspace_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load workspace owner id: {e}")))?
    .ok_or_else(|| DomainError::NotFound(format!("workspace {workspace_id} owner not found")))?;
    let view = crate::users::load_current_user_in_tx(tx.tx_mut(), &owner_id)
      .await?
      .ok_or_else(|| DomainError::NotFound("workspace owner user not found".to_owned()))?;
    let _ = tx.rollback().await;
    Ok(view)
  }

  pub async fn resolve_workspace_permissions(
    &self,
    user_id: &str,
    workspace_id: &str,
  ) -> Result<WorkspacePermissionsView, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("begin resolve_workspace_permissions: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load permissions clock: {e}")))?;
    let ws_policy: Option<(bool, bool, bool)> = sqlx::query_as(
      r#"SELECT COALESCE(p.visibility = 'public', false),
                COALESCE(p.sharing_enabled, true),
                COALESCE(p.url_preview_enabled, false)
         FROM workspaces w
         LEFT JOIN workspace_access_policies p ON p.workspace_id = w.id
         WHERE w.id = $1"#,
    )
    .bind(workspace_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load workspace visibility: {e}")))?;
    let Some((ws_public, sharing_enabled, url_preview_enabled)) = ws_policy else {
      return Err(DomainError::NotFound(format!("workspace {workspace_id} not found")));
    };
    let role_str: Option<String> = sqlx::query_scalar(
      "SELECT role::text FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active' LIMIT 1",
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load member role for permissions: {e}")))?;
    let role = role_str.as_deref().map(WorkspaceRole::parse).transpose()?;
    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, now)
      .await?;
    let _ = tx.rollback().await;
    Ok(WorkspacePermissionsView::for_role(
      role,
      grant.rights.commercial,
      ws_public,
      sharing_enabled,
      url_preview_enabled,
    ))
  }

  pub async fn list_workspace_members(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    skip: i64,
    take: i64,
    query: Option<&str>,
  ) -> Result<Vec<WorkspaceMemberView>, DomainError> {
    if let Some(q) = query
      && q.len() > 255
    {
      return Err(DomainError::Validation("query_too_long:255".to_owned()));
    }
    let _ = self.require_active_member_role(workspace_id, actor_user_id).await?;
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire list_workspace_members: {e}")))?;

    let pattern = query
      .map(str::trim)
      .filter(|s| !s.is_empty())
      .map(|s| format!("%{}%", s.to_ascii_lowercase()));

    let rows = sqlx::query(
      r#"SELECT * FROM (
           SELECT u.id AS user_id, u.name, u.email, u.avatar_url,
                  (u.email_verified IS NOT NULL) AS email_verified,
                  u.disabled,
                  m.role::text AS role,
                  u.id AS invite_id,
                  'Accepted'::text AS status,
                  m.created_at AS sort_at
           FROM workspace_members m
           JOIN users u ON u.id = m.user_id
           WHERE m.workspace_id = $1 AND m.state = 'active'
           UNION ALL
           SELECT COALESCE(u.id, i.id) AS user_id,
                  COALESCE(u.name, COALESCE(i.normalized_email, '')) AS name,
                  COALESCE(u.email, COALESCE(i.normalized_email, '')) AS email,
                  u.avatar_url,
                  (u.email_verified IS NOT NULL) AS email_verified,
                  COALESCE(u.disabled, false) AS disabled,
                  i.requested_role::text AS role,
                  i.id AS invite_id,
                  CASE i.status::text
                    WHEN 'pending' THEN 'Pending'
                    WHEN 'waiting_review' THEN 'UnderReview'
                    WHEN 'waiting_seat' THEN 'NeedMoreSeat'
                    ELSE 'Pending'
                  END AS status,
                  i.created_at AS sort_at
           FROM workspace_invitations i
           LEFT JOIN users u ON u.id = i.invitee_user_id
           WHERE i.workspace_id = $1
             AND i.status::text = ANY($5)
         ) combined
         WHERE ($2::text IS NULL OR lower(combined.name) LIKE $2 OR lower(combined.email) LIKE $2)
         ORDER BY combined.sort_at ASC, combined.user_id ASC
         OFFSET $3 LIMIT $4"#,
    )
    .bind(workspace_id)
    .bind(pattern.as_deref())
    .bind(skip.max(0))
    .bind(take.clamp(1, 500))
    .bind(CHARGEABLE_INVITATION_STATUSES.as_slice())
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("list workspace members: {e}")))?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
      let role_str: String = row.get("role");
      out.push(WorkspaceMemberView {
        id: row.get("user_id"),
        name: row.get("name"),
        email: row.get("email"),
        avatar_url: row.get("avatar_url"),
        email_verified: row.get("email_verified"),
        disabled: row.get("disabled"),
        role: WorkspaceRole::parse(&role_str)?,
        invite_id: row.get("invite_id"),
        status: row.get("status"),
      });
    }
    Ok(out)
  }

  /// Permanently deletes a workspace (Owner only) and returns object-storage
  /// keys that must be removed after the database transaction commits.
  pub async fn delete_workspace_with_cleanup(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
  ) -> Result<DeletedWorkspaceCleanup, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin delete_workspace: {e}")))?;
    lock_workspace_row(tx.tx_mut(), workspace_id).await?;
    let actor_role = require_active_member_role(tx.tx_mut(), workspace_id, actor_user_id).await?;
    if actor_role != WorkspaceRole::Owner {
      return Err(DomainError::Forbidden(
        "only workspace owner may delete workspace".to_owned(),
      ));
    }
    let blob_keys: Vec<String> = sqlx::query_scalar("SELECT key FROM blobs WHERE workspace_id = $1")
      .bind(workspace_id)
      .fetch_all(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load deleted workspace blobs: {e}")))?;
    let comment_attachments: Vec<(String, String)> =
      sqlx::query_as("SELECT doc_id, key FROM comment_attachments WHERE workspace_id = $1")
        .bind(workspace_id)
        .fetch_all(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("load deleted workspace comment attachments: {e}")))?;

    sqlx::query("DELETE FROM workspaces WHERE id = $1")
      .bind(workspace_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("delete workspace: {e}")))?;
    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit delete_workspace: {e}")))?;

    let _ = self
      .invalidation
      .publish_invalidation(&InvalidationHintV1::WorkspaceInventoryChanged {
        workspace_id: workspace_id.to_owned(),
        doc_id: None,
      })
      .await;
    Ok(DeletedWorkspaceCleanup {
      blob_keys,
      comment_attachments,
    })
  }

  /// Permanently deletes a workspace (Owner only).
  pub async fn delete_workspace(&self, actor_user_id: &str, workspace_id: &str) -> Result<(), DomainError> {
    let _ = self.delete_workspace_with_cleanup(actor_user_id, workspace_id).await?;
    Ok(())
  }

  /// Removes `actor_user_id` from `workspace_id`. Rejects Owners with
  /// `workspace_owner_cannot_leave`.
  pub async fn leave_workspace(&self, actor_user_id: &str, workspace_id: &str) -> Result<(), DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin leave_workspace: {e}")))?;
    lock_workspace_row(tx.tx_mut(), workspace_id).await?;
    let role: Option<String> = sqlx::query_scalar(
      "SELECT role::text FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active' FOR UPDATE",
    )
    .bind(workspace_id)
    .bind(actor_user_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("lock leaving workspace member: {e}")))?;
    let Some(role_str) = role else {
      return Err(DomainError::NotFound("workspace_member_not_found".to_owned()));
    };
    if WorkspaceRole::parse(&role_str)? == WorkspaceRole::Owner {
      return Err(DomainError::Forbidden("workspace_owner_cannot_leave".to_owned()));
    }
    sqlx::query("DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active'")
      .bind(workspace_id)
      .bind(actor_user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("delete leaving workspace member: {e}")))?;
    sqlx::query("DELETE FROM workspace_invitations WHERE workspace_id = $1 AND invitee_user_id = $2")
      .bind(workspace_id)
      .bind(actor_user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("delete leaving workspace invitation: {e}")))?;

    let owner_id: Option<String> = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND role = 'owner' AND state = 'active' LIMIT 1",
    )
    .bind(workspace_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load owner for member leave mail: {e}")))?;
    if let Some(owner_id) = owner_id {
      let actor_email: String = sqlx::query_scalar("SELECT email FROM users WHERE id = $1")
        .bind(actor_user_id)
        .fetch_optional(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("load leaving member email: {e}")))?
        .unwrap_or_default();
      let ws_name = load_workspace_display_name_for_mail(tx.tx_mut(), workspace_id).await?;
      crate::notifications::enqueue_notification_mail_in_tx(
        tx.tx_mut(),
        crate::notifications::EnqueueNotificationMail {
          private_key: &self.private_key,
          mail_name: "MemberLeave",
          mail_class: "workspace_lifecycle",
          recipient_user_id: &owner_id,
          actor_user_id: Some(actor_user_id),
          workspace_id: Some(workspace_id),
          notification_id: None,
          pref_field: None,
          props: serde_json::json!({
            "user": { "email": actor_email },
            "workspace": { "name": ws_name },
          }),
          skip_if_domain_in_workspace_name: None,
        },
      )
      .await?;
    }

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit leave_workspace: {e}")))?;

    let _ = self
      .invalidation
      .publish_invalidation(&InvalidationHintV1::QuotaSeatUsage {
        workspace_id: workspace_id.to_owned(),
      })
      .await;
    let _ = self
      .invalidation
      .publish_invalidation(&InvalidationHintV1::WorkspaceInventoryChanged {
        workspace_id: workspace_id.to_owned(),
        doc_id: None,
      })
      .await;
    self.notify_billing_members_changed(workspace_id).await;
    Ok(())
  }

  /// Transfers workspace ownership from `actor_user_id` (current Owner) to an
  /// active member `target_user_id`.
  ///
  /// For commercial/team workspaces the previous Owner becomes `Admin`; for
  /// non-commercial workspaces the previous Owner becomes `Member`. Emits
  /// `QuotaOwnerMapping`, `WorkspaceInventoryChanged`, and `QuotaSeatUsage`.
  pub async fn transfer_workspace_ownership(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    target_user_id: &str,
  ) -> Result<WorkspaceMemberRecord, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin transfer_workspace_ownership: {e}")))?;
    // Lock involved user rows in deterministic ascending ID order BEFORE locking
    // the workspace row so concurrent `UserService::delete_user` on `target_user_id`
    // is strictly serialized and can never leave a Team workspace ownerless.
    let mut user_ids = vec![actor_user_id, target_user_id];
    user_ids.sort_unstable();
    user_ids.dedup();
    for uid in user_ids {
      let row = sqlx::query("SELECT id, disabled FROM users WHERE id = $1 FOR UPDATE")
        .bind(uid)
        .fetch_optional(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("lock user for ownership transfer: {e}")))?;
      match row {
        Some(r) if !r.get::<bool, _>("disabled") => {}
        _ => {
          return Err(DomainError::Validation(
            "new workspace owner must be an active member".to_owned(),
          ));
        }
      }
    }
    lock_workspace_row(tx.tx_mut(), workspace_id).await?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load transfer clock: {e}")))?;
    let actor_role = require_active_member_role(tx.tx_mut(), workspace_id, actor_user_id).await?;
    if actor_role != WorkspaceRole::Owner {
      return Err(DomainError::Forbidden(
        "only workspace owner may transfer ownership".to_owned(),
      ));
    }
    let target_active: Option<String> = sqlx::query_scalar(
      "SELECT role::text FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active' FOR UPDATE",
    )
    .bind(workspace_id)
    .bind(target_user_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("lock target owner: {e}")))?;
    if target_active.is_none() {
      return Err(DomainError::Validation(
        "new workspace owner must be an active member".to_owned(),
      ));
    }

    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, now)
      .await?;
    if grant.limits.seat_limit <= 0 {
      return Err(DomainError::QuotaExceeded {
        kind: "seat_limit",
        message: "workspace is in fail-closed readonly state".to_owned(),
      });
    }
    let is_team = grant.rights.commercial || grant.billing_subject == server_types::BillingSubject::Workspace;
    let fallback_role = if is_team {
      WorkspaceRole::Admin
    } else {
      WorkspaceRole::Member
    };

    if actor_user_id != target_user_id {
      sqlx::query(
        "UPDATE workspace_members
         SET role = $2, updated_at = clock_timestamp()
         WHERE workspace_id = $1 AND role = 'owner' AND state = 'active' AND user_id <> $3",
      )
      .bind(workspace_id)
      .bind(fallback_role.as_str())
      .bind(target_user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("demote previous owner: {e}")))?;
    }

    let row = sqlx::query(
      r#"UPDATE workspace_members
         SET role = 'owner', updated_at = clock_timestamp()
         WHERE workspace_id = $1 AND user_id = $2 AND state = 'active'
         RETURNING id, workspace_id, user_id, role, state, source, created_at, updated_at"#,
    )
    .bind(workspace_id)
    .bind(target_user_id)
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("promote new owner: {e}")))?;

    if actor_user_id != target_user_id {
      let ws_name = load_workspace_display_name_for_mail(tx.tx_mut(), workspace_id).await?;
      crate::notifications::enqueue_notification_mail_in_tx(
        tx.tx_mut(),
        crate::notifications::EnqueueNotificationMail {
          private_key: &self.private_key,
          mail_name: "OwnershipTransferred",
          mail_class: "workspace_lifecycle",
          recipient_user_id: actor_user_id,
          actor_user_id: Some(actor_user_id),
          workspace_id: Some(workspace_id),
          notification_id: None,
          pref_field: None,
          props: serde_json::json!({ "workspace": { "name": ws_name } }),
          skip_if_domain_in_workspace_name: None,
        },
      )
      .await?;
      crate::notifications::enqueue_notification_mail_in_tx(
        tx.tx_mut(),
        crate::notifications::EnqueueNotificationMail {
          private_key: &self.private_key,
          mail_name: "OwnershipReceived",
          mail_class: "workspace_lifecycle",
          recipient_user_id: target_user_id,
          actor_user_id: Some(actor_user_id),
          workspace_id: Some(workspace_id),
          notification_id: None,
          pref_field: None,
          props: serde_json::json!({ "workspace": { "name": ws_name } }),
          skip_if_domain_in_workspace_name: None,
        },
      )
      .await?;
    }

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit transfer_workspace_ownership: {e}")))?;

    for hint in [
      InvalidationHintV1::QuotaOwnerMapping {
        workspace_id: workspace_id.to_owned(),
      },
      InvalidationHintV1::QuotaStorageUsage {
        subject: format!("workspace:{workspace_id}"),
      },
      InvalidationHintV1::QuotaStorageUsage {
        subject: format!("user:{actor_user_id}"),
      },
      InvalidationHintV1::QuotaStorageUsage {
        subject: format!("user:{target_user_id}"),
      },
      InvalidationHintV1::WorkspaceInventoryChanged {
        workspace_id: workspace_id.to_owned(),
        doc_id: None,
      },
      InvalidationHintV1::QuotaSeatUsage {
        workspace_id: workspace_id.to_owned(),
      },
    ] {
      let _ = self.invalidation.publish_invalidation(&hint).await;
    }
    self
      .publish_workspace_members_changed(workspace_id, "owner-changed")
      .await;

    Ok(WorkspaceMemberRecord {
      id: row.get("id"),
      workspace_id: row.get("workspace_id"),
      user_id: row.get("user_id"),
      role: WorkspaceRole::parse(&row.get::<String, _>("role"))?,
      state: row.get("state"),
      source: row.get("source"),
      created_at: row.get("created_at"),
      updated_at: row.get("updated_at"),
    })
  }

  /// Approves a `waiting_review` invitation into an active member (Owner or commercial Admin).
  pub async fn approve_member(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    target_user_id: &str,
  ) -> Result<(), DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin approve_member: {e}")))?;
    lock_workspace_row(tx.tx_mut(), workspace_id).await?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load approve_member clock: {e}")))?;
    let actor_role = require_active_member_role(tx.tx_mut(), workspace_id, actor_user_id).await?;
    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, now)
      .await?;
    if !matches!(
      actor_role.effective(grant.rights.commercial),
      WorkspaceRole::Owner | WorkspaceRole::Admin
    ) {
      return Err(DomainError::Forbidden(
        "only workspace owner or commercial admin may approve members".to_owned(),
      ));
    }

    let inv = sqlx::query(
      r#"SELECT id, requested_role::text AS requested_role, kind::text AS kind, status::text AS status
         FROM workspace_invitations
         WHERE workspace_id = $1 AND invitee_user_id = $2
         FOR UPDATE"#,
    )
    .bind(workspace_id)
    .bind(target_user_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("lock invitation for approve: {e}")))?;

    let Some(inv) = inv else {
      let active: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active')",
      )
      .bind(workspace_id)
      .bind(target_user_id)
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("check already active member: {e}")))?;
      if active {
        return Ok(());
      }
      return Err(DomainError::NotFound("workspace_member_not_found".to_owned()));
    };

    let status: String = inv.get("status");
    if status != "waiting_review" {
      return Ok(());
    }
    let inv_id: String = inv.get("id");
    let role_str: String = inv.get("requested_role");
    let role = WorkspaceRole::parse(&role_str)?;
    let source: String = inv.get("kind");

    let current_charged_excluding_this = (count_charged_seats_in_tx(tx.tx_mut(), workspace_id).await? - 1).max(0);
    self
      .quota_gate
      .check_seat_admission(tx.tx_mut(), workspace_id, current_charged_excluding_this, 1, now)
      .await?;

    sqlx::query(
      r#"INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'active', $5, $6, $6)
         ON CONFLICT (workspace_id, user_id, state) DO NOTHING"#,
    )
    .bind(&inv_id)
    .bind(workspace_id)
    .bind(target_user_id)
    .bind(role.as_str())
    .bind(&source)
    .bind(now)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("activate approved member: {e}")))?;

    sqlx::query("DELETE FROM workspace_invitations WHERE id = $1")
      .bind(&inv_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("delete approved invitation: {e}")))?;

    crate::notifications::insert_invitation_notification_with_key_in_tx(
      tx.tx_mut(),
      target_user_id,
      actor_user_id,
      workspace_id,
      &inv_id,
      "InvitationReviewApproved",
      &self.base_url,
      &self.private_key,
    )
    .await?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit approve_member: {e}")))?;

    crate::notifications::publish_notification_count_changed(
      &self.db,
      self.event_bus.as_ref(),
      target_user_id,
      "created",
    )
    .await;

    for hint in [
      InvalidationHintV1::QuotaSeatUsage {
        workspace_id: workspace_id.to_owned(),
      },
      InvalidationHintV1::WorkspaceInventoryChanged {
        workspace_id: workspace_id.to_owned(),
        doc_id: None,
      },
    ] {
      let _ = self.invalidation.publish_invalidation(&hint).await;
    }
    self.notify_billing_members_changed(workspace_id).await;
    Ok(())
  }

  /// Creates or returns an active workspace invite link (stored in Redis under
  /// `workspace:inviteLink:<ws>` and `workspace:inviteLinkId:<id>` via atomic
  /// Lua scripts to match `v0.27.5` 1:1).
  pub async fn create_invite_link(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    expire_ms: i64,
    source: Option<&RequestSource>,
  ) -> Result<WorkspaceInviteLink, DomainError> {
    if expire_ms <= 0 {
      return Err(DomainError::Validation("expire_ms must be positive".to_owned()));
    }
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin create_invite_link: {e}")))?;
    let ws_name: Option<String> = sqlx::query_scalar("SELECT name FROM workspaces WHERE id = $1")
      .bind(workspace_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load workspace for invite link: {e}")))?
      .ok_or_else(|| DomainError::NotFound(format!("workspace {workspace_id} not found")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load invite link clock: {e}")))?;
    let actor_role = require_active_member_role(tx.tx_mut(), workspace_id, actor_user_id).await?;
    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, now)
      .await?;
    if !matches!(
      actor_role.effective(grant.rights.commercial),
      WorkspaceRole::Owner | WorkspaceRole::Admin
    ) {
      return Err(DomainError::Forbidden(
        "only workspace owner or commercial admin may create invite link".to_owned(),
      ));
    }
    if let Some(name) = ws_name.as_deref()
      && crate::content_policy::contains_url_or_domain(name)
    {
      return Err(DomainError::Forbidden(
        "Workspace names containing links or domains cannot be used to invite members.".to_owned(),
      ));
    }
    if let Err(rejection) = self
      .rate_limit_policy
      .check_workspace_invite_link(tx.tx_mut(), workspace_id, actor_user_id, source, now)
      .await
    {
      tx.rollback()
        .await
        .map_err(|e| DomainError::Internal(format!("rollback rejected workspace invite: {e}")))?;
      return Err(rejection.apply_post_rollback().await?);
    }
    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit create_invite_link rate limit: {e}")))?;

    let candidate_id = generate_invite_link_nanoid();
    let ttl_ms = expire_ms.max(1_000);

    if let Some(client) = &self.redis {
      let mut conn = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| DomainError::Unavailable(format!("redis invite link connect: {e}")))?;
      let ws_key = format!("workspace:inviteLink:{workspace_id}");
      let id_key = format!("workspace:inviteLinkId:{candidate_id}");
      let ws_val = serde_json::json!({ "inviteId": candidate_id }).to_string();
      let id_val = serde_json::json!({
        "workspaceId": workspace_id,
        "inviterUserId": actor_user_id,
      })
      .to_string();
      let res: Vec<String> = redis::Script::new(CREATE_INVITE_LINK_LUA)
        .key(&ws_key)
        .key(&id_key)
        .arg(&ws_val)
        .arg(&id_val)
        .arg(ttl_ms)
        .invoke_async(&mut conn)
        .await
        .map_err(|e| DomainError::Unavailable(format!("redis atomic create invite link: {e}")))?;
      let raw_ws = res.first().map(String::as_str).unwrap_or(&ws_val);
      let effective_ttl_ms = res
        .get(1)
        .and_then(|s| s.parse::<i64>().ok())
        .filter(|&v| v > 0)
        .unwrap_or(ttl_ms);
      let parsed: serde_json::Value = serde_json::from_str(raw_ws).unwrap_or_default();
      let effective_id = parsed
        .get("inviteId")
        .and_then(|v| v.as_str())
        .unwrap_or(&candidate_id)
        .to_owned();
      Ok(WorkspaceInviteLink {
        invite_id: effective_id,
        workspace_id: workspace_id.to_owned(),
        inviter_user_id: actor_user_id.to_owned(),
        expire_time: now + chrono::Duration::milliseconds(effective_ttl_ms),
      })
    } else {
      let mut guard = self.fallback_invite_links.write().await;
      if let Some(existing) = guard.get(workspace_id).filter(|l| l.expire_time > now) {
        return Ok(existing.clone());
      }
      let link = WorkspaceInviteLink {
        invite_id: candidate_id,
        workspace_id: workspace_id.to_owned(),
        inviter_user_id: actor_user_id.to_owned(),
        expire_time: now + chrono::Duration::milliseconds(ttl_ms),
      };
      guard.insert(workspace_id.to_owned(), link.clone());
      Ok(link)
    }
  }

  pub async fn get_invite_link(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
  ) -> Result<Option<WorkspaceInviteLink>, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("begin get_invite_link: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load get_invite_link clock: {e}")))?;
    let actor_role = require_active_member_role(tx.tx_mut(), workspace_id, actor_user_id).await?;
    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, now)
      .await?;
    let _ = tx.rollback().await;
    if !matches!(
      actor_role.effective(grant.rights.commercial),
      WorkspaceRole::Owner | WorkspaceRole::Admin
    ) {
      return Err(DomainError::Forbidden(
        "only workspace owner or commercial admin may read invite link".to_owned(),
      ));
    }

    if let Some(client) = &self.redis {
      let mut conn = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| DomainError::Unavailable(format!("redis get invite link connect: {e}")))?;
      let ws_key = format!("workspace:inviteLink:{workspace_id}");
      let raw: Option<String> = redis::cmd("GET")
        .arg(&ws_key)
        .query_async(&mut conn)
        .await
        .map_err(|e| DomainError::Unavailable(format!("redis get invite link: {e}")))?;
      let Some(raw) = raw else {
        return Ok(None);
      };
      let pttl: i64 = redis::cmd("PTTL")
        .arg(&ws_key)
        .query_async(&mut conn)
        .await
        .map_err(|e| DomainError::Unavailable(format!("redis pttl invite link: {e}")))?;
      if pttl <= 0 {
        return Ok(None);
      }
      let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();
      let Some(invite_id) = parsed.get("inviteId").and_then(|v| v.as_str()) else {
        return Ok(None);
      };
      Ok(Some(WorkspaceInviteLink {
        invite_id: invite_id.to_owned(),
        workspace_id: workspace_id.to_owned(),
        inviter_user_id: actor_user_id.to_owned(),
        expire_time: Utc::now() + chrono::Duration::milliseconds(pttl),
      }))
    } else {
      let guard = self.fallback_invite_links.read().await;
      Ok(guard.get(workspace_id).filter(|l| l.expire_time > Utc::now()).cloned())
    }
  }

  pub async fn revoke_invite_link(&self, actor_user_id: &str, workspace_id: &str) -> Result<bool, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("begin revoke_invite_link: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load revoke_invite_link clock: {e}")))?;
    let actor_role = require_active_member_role(tx.tx_mut(), workspace_id, actor_user_id).await?;
    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, now)
      .await?;
    let _ = tx.rollback().await;
    if !matches!(
      actor_role.effective(grant.rights.commercial),
      WorkspaceRole::Owner | WorkspaceRole::Admin
    ) {
      return Err(DomainError::Forbidden(
        "only workspace owner or commercial admin may revoke invite link".to_owned(),
      ));
    }

    if let Some(client) = &self.redis {
      let mut conn = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| DomainError::Unavailable(format!("redis revoke invite link connect: {e}")))?;
      let ws_key = format!("workspace:inviteLink:{workspace_id}");
      let deleted: i64 = redis::Script::new(REVOKE_INVITE_LINK_LUA)
        .key(&ws_key)
        .arg("workspace:inviteLinkId:")
        .invoke_async(&mut conn)
        .await
        .map_err(|e| DomainError::Unavailable(format!("redis atomic revoke invite link: {e}")))?;
      Ok(deleted > 0)
    } else {
      let mut guard = self.fallback_invite_links.write().await;
      Ok(guard.remove(workspace_id).is_some())
    }
  }

  async fn accept_invite_link(
    &self,
    invitee_user_id: &str,
    invite_id: &str,
  ) -> Result<WorkspaceMemberRecord, DomainError> {
    let Some((ws_id, inviter_id)) = self.lookup_invite_link_by_id(invite_id).await? else {
      return Err(DomainError::NotFound("invalid_invitation".to_owned()));
    };

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin accept_invite_link: {e}")))?;

    let owner_id: String = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND role = 'owner' AND state = 'active' LIMIT 1",
    )
    .bind(&ws_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("locate workspace owner for link accept: {e}")))?
    .ok_or_else(|| DomainError::NotFound("workspace owner not found".to_owned()))?;

    let mut users_to_lock = vec![owner_id.clone(), invitee_user_id.to_owned()];
    users_to_lock.sort();
    users_to_lock.dedup();
    sqlx::query("SELECT id FROM users WHERE id = ANY($1) ORDER BY id FOR UPDATE")
      .bind(&users_to_lock)
      .fetch_all(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock accept_invite_link users: {e}")))?;

    lock_workspace_row(tx.tx_mut(), &ws_id).await?;

    let locked_owner_id: String = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND role = 'owner' AND state = 'active' LIMIT 1",
    )
    .bind(&ws_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("verify locked owner for link accept: {e}")))?
    .ok_or_else(|| DomainError::NotFound("workspace owner not found".to_owned()))?;
    if locked_owner_id != owner_id {
      return Err(DomainError::Conflict("workspace owner changed".to_owned()));
    }

    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load link accept clock: {e}")))?;

    let already_member: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active')",
    )
    .bind(&ws_id)
    .bind(invitee_user_id)
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("check existing member on link accept: {e}")))?;
    if already_member {
      return Err(DomainError::Conflict("already_in_space".to_owned()));
    }

    let user_email: String = sqlx::query_scalar("SELECT lower(email) FROM users WHERE id = $1")
      .bind(invitee_user_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load link invitee email: {e}")))?
      .ok_or_else(|| DomainError::NotFound("user not found".to_owned()))?;

    let existing_inv = sqlx::query(
      r#"SELECT id, requested_role::text AS requested_role, kind::text AS kind, status::text AS status
         FROM workspace_invitations
         WHERE workspace_id = $1
           AND (invitee_user_id = $2 OR (invitee_user_id IS NULL AND lower(normalized_email) = lower($3)))
         FOR UPDATE"#,
    )
    .bind(&ws_id)
    .bind(invitee_user_id)
    .bind(&user_email)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load existing invitation on link accept: {e}")))?;

    if let Some(inv) = existing_inv {
      let status: String = inv.get("status");
      if status == "pending" {
        let inv_id: String = inv.get("id");
        let role = WorkspaceRole::parse(&inv.get::<String, _>("requested_role"))?;
        let source: String = inv.get("kind");
        let current_charged_excl = (count_charged_seats_in_tx(tx.tx_mut(), &ws_id).await? - 1).max(0);
        self
          .quota_gate
          .check_seat_admission(tx.tx_mut(), &ws_id, current_charged_excl, 1, now)
          .await?;
        sqlx::query(
          r#"INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'active', $5, $6, $6)
             ON CONFLICT (workspace_id, user_id, state) DO NOTHING"#,
        )
        .bind(&inv_id)
        .bind(&ws_id)
        .bind(invitee_user_id)
        .bind(role.as_str())
        .bind(&source)
        .bind(now)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("activate pending invite via link: {e}")))?;
        sqlx::query("DELETE FROM workspace_invitations WHERE id = $1")
          .bind(&inv_id)
          .execute(&mut **tx.tx_mut())
          .await
          .map_err(|e| DomainError::Internal(format!("consume pending invite via link: {e}")))?;
        tx.commit()
          .await
          .map_err(|e| DomainError::Internal(format!("commit pending invite via link: {e}")))?;
        let _ = self
          .invalidation
          .publish_invalidation(&InvalidationHintV1::QuotaSeatUsage {
            workspace_id: ws_id.clone(),
          })
          .await;
        self.notify_billing_members_changed(&ws_id).await;
        return Ok(WorkspaceMemberRecord {
          id: inv_id,
          workspace_id: ws_id,
          user_id: invitee_user_id.to_owned(),
          role,
          state: "active".to_owned(),
          source,
          created_at: now,
          updated_at: now,
        });
      }
      if status == "waiting_review" || status == "waiting_seat" {
        return Err(DomainError::Conflict("already_in_space".to_owned()));
      }
      // Clear stale non-chargeable invitation row before inserting waiting_review.
      let stale_id: String = inv.get("id");
      sqlx::query("DELETE FROM workspace_invitations WHERE id = $1")
        .bind(&stale_id)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("delete stale invite on link accept: {e}")))?;
    }

    let current_charged = count_charged_seats_in_tx(tx.tx_mut(), &ws_id).await?;
    self
      .quota_gate
      .check_seat_admission(tx.tx_mut(), &ws_id, current_charged, 1, now)
      .await?;

    let review_id = format!("inv_{}", Uuid::new_v4().simple());
    let inviter_opt = (!inviter_id.is_empty()).then_some(inviter_id.as_str());
    sqlx::query(
      r#"INSERT INTO workspace_invitations
           (id, workspace_id, invitee_user_id, normalized_email, inviter_user_id, requested_role, status, kind, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'member', 'waiting_review', 'link', $6, $6)"#,
    )
    .bind(&review_id)
    .bind(&ws_id)
    .bind(invitee_user_id)
    .bind(&user_email)
    .bind(inviter_opt)
    .bind(now)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("insert waiting_review link invitation: {e}")))?;

    let reviewers: Vec<String> = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND role IN ('owner', 'admin') AND state = 'active'",
    )
    .bind(&ws_id)
    .fetch_all(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load reviewers for link invitation: {e}")))?;
    for reviewer_id in &reviewers {
      crate::notifications::insert_invitation_notification_with_key_in_tx(
        tx.tx_mut(),
        reviewer_id,
        invitee_user_id,
        &ws_id,
        &review_id,
        "InvitationReviewRequest",
        &self.base_url,
        &self.private_key,
      )
      .await?;
    }

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit waiting_review link invitation: {e}")))?;

    for reviewer_id in &reviewers {
      crate::notifications::publish_notification_count_changed(
        &self.db,
        self.event_bus.as_ref(),
        reviewer_id,
        "created",
      )
      .await;
    }

    let _ = self
      .invalidation
      .publish_invalidation(&InvalidationHintV1::QuotaSeatUsage {
        workspace_id: ws_id.clone(),
      })
      .await;
    self.notify_billing_members_changed(&ws_id).await;

    Ok(WorkspaceMemberRecord {
      id: review_id,
      workspace_id: ws_id,
      user_id: invitee_user_id.to_owned(),
      role: WorkspaceRole::Member,
      state: "waiting_review".to_owned(),
      source: "link".to_owned(),
      created_at: now,
      updated_at: now,
    })
  }

  async fn lookup_invite_link_by_id(&self, invite_id: &str) -> Result<Option<(String, String)>, DomainError> {
    if let Some(client) = &self.redis {
      let mut conn = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| DomainError::Unavailable(format!("redis lookup invite link: {e}")))?;
      let raw: Option<String> = redis::cmd("GET")
        .arg(format!("workspace:inviteLinkId:{invite_id}"))
        .query_async(&mut conn)
        .await
        .map_err(|e| DomainError::Unavailable(format!("redis get invite link id: {e}")))?;
      let Some(raw) = raw else {
        return Ok(None);
      };
      let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();
      let ws_id = parsed.get("workspaceId").and_then(|v| v.as_str());
      let inviter_id = parsed.get("inviterUserId").and_then(|v| v.as_str());
      Ok(ws_id.map(|w| (w.to_owned(), inviter_id.unwrap_or_default().to_owned())))
    } else {
      let guard = self.fallback_invite_links.read().await;
      let now = Utc::now();
      Ok(
        guard
          .values()
          .find(|l| l.invite_id == invite_id && l.expire_time > now)
          .map(|l| (l.workspace_id.clone(), l.inviter_user_id.clone())),
      )
    }
  }

  pub async fn get_invite_info(&self, actor_user_id: &str, invite_id: &str) -> Result<InviteInfoView, DomainError> {
    let (workspace_id, invitee_user_id, is_link, status) =
      if let Some((ws_id, _inviter_id)) = self.lookup_invite_link_by_id(invite_id).await? {
        let mut conn = self
          .db
          .acquire_tiered(WorkloadTier::InteractiveRead)
          .await
          .map_err(|e| DomainError::Internal(format!("acquire get_invite_info link: {e}")))?;
        let is_active: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active')",
      )
      .bind(&ws_id)
      .bind(actor_user_id)
      .fetch_one(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("check invitee active status: {e}")))?;
        let status = if is_active {
          Some("Accepted".to_owned())
        } else {
          let inv_status: Option<String> = sqlx::query_scalar(
            "SELECT status::text FROM workspace_invitations WHERE workspace_id = $1 AND invitee_user_id = $2 LIMIT 1",
          )
          .bind(&ws_id)
          .bind(actor_user_id)
          .fetch_optional(&mut *conn)
          .await
          .map_err(|e| DomainError::Internal(format!("load link invitee status: {e}")))?;
          inv_status.map(|s| match s.as_str() {
            "waiting_review" => "UnderReview".to_owned(),
            "waiting_seat" => "NeedMoreSeat".to_owned(),
            _ => "Pending".to_owned(),
          })
        };
        (ws_id, actor_user_id.to_owned(), true, status)
      } else {
        let mut conn = self
          .db
          .acquire_tiered(WorkloadTier::InteractiveRead)
          .await
          .map_err(|e| DomainError::Internal(format!("acquire get_invite_info email: {e}")))?;
        let row = sqlx::query(
          "SELECT workspace_id, invitee_user_id, normalized_email, status::text AS status
           FROM workspace_invitations
           WHERE id = $1",
        )
        .bind(invite_id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(|e| DomainError::Internal(format!("load invitation by id: {e}")))?
        .ok_or_else(|| DomainError::NotFound("Invitation not found".to_owned()))?;
        let ws_id: String = row.get("workspace_id");
        let invitee_uid: Option<String> = row.get("invitee_user_id");
        if let Some(ref uid) = invitee_uid {
          if uid != actor_user_id {
            return Err(DomainError::Forbidden("invitation_account_mismatch".to_owned()));
          }
        } else {
          let inv_email: Option<String> = row.get("normalized_email");
          let actor_email: Option<String> = sqlx::query_scalar("SELECT lower(email) FROM users WHERE id = $1")
            .bind(actor_user_id)
            .fetch_optional(&mut *conn)
            .await
            .map_err(|e| DomainError::Internal(format!("load actor email for invite info: {e}")))?;
          let matches = match (inv_email.as_deref(), actor_email.as_deref()) {
            (Some(expected), Some(actual)) => expected.eq_ignore_ascii_case(actual),
            _ => false,
          };
          if !matches {
            return Err(DomainError::Forbidden("invitation_account_mismatch".to_owned()));
          }
        }
        let raw_status: String = row.get("status");
        let mapped = match raw_status.as_str() {
          "waiting_review" => "UnderReview",
          "waiting_seat" => "NeedMoreSeat",
          _ => "Pending",
        };
        (
          ws_id,
          invitee_uid.unwrap_or_else(|| actor_user_id.to_owned()),
          false,
          Some(mapped.to_owned()),
        )
      };

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("begin get_invite_info details: {e}")))?;
    let ws_row = sqlx::query("SELECT name, avatar_key FROM workspaces WHERE id = $1")
      .bind(&workspace_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load invite workspace info: {e}")))?
      .ok_or_else(|| DomainError::NotFound("workspace not found".to_owned()))?;
    let db_workspace_name: Option<String> = ws_row
      .get::<Option<String>, _>("name")
      .map(|s| s.trim().to_owned())
      .filter(|s| !s.is_empty());
    let db_avatar_key: Option<String> = ws_row
      .get::<Option<String>, _>("avatar_key")
      .map(|s| s.trim().to_owned())
      .filter(|s| !s.is_empty());

    let (yjs_name, yjs_avatar) = load_workspace_root_meta_in_tx(tx.tx_mut(), &workspace_id).await?;
    let workspace_name = yjs_name
      .or(db_workspace_name)
      .unwrap_or_else(|| "Untitled Workspace".to_owned());
    let workspace_avatar_key = yjs_avatar.or(db_avatar_key);

    let invitee = crate::users::load_current_user_in_tx(tx.tx_mut(), &invitee_user_id)
      .await?
      .ok_or_else(|| DomainError::NotFound("user not found".to_owned()))?;
    let _ = tx.rollback().await;
    let owner = self.get_workspace_owner(&workspace_id).await?;

    Ok(InviteInfoView {
      workspace_id,
      workspace_name,
      workspace_avatar_key,
      owner,
      invitee,
      status,
      is_link,
    })
  }

  /// Loads canonical workspace storage usage (sum of active/in-flight `blobs`
  /// and `comment_attachments`) and charged seat count (active members +
  /// chargeable invitations), matching `v0.27.5` `quota_read_cache/loader.rs` 1:1.
  pub async fn load_workspace_usage(&self, workspace_id: &str) -> Result<WorkspaceUsage, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("begin load_workspace_usage: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load_workspace_usage clock: {e}")))?;

    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, now)
      .await?;

    let used_storage_quota =
      load_effective_storage_usage_in_tx(tx.tx_mut(), self.quota_gate.as_ref(), workspace_id, &grant, now).await?;

    let member_count = count_charged_seats_in_tx(tx.tx_mut(), workspace_id).await?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit load_workspace_usage: {e}")))?;

    Ok(WorkspaceUsage {
      used_storage_quota,
      member_count,
    })
  }
}

#[derive(Clone, Debug, Default)]
pub struct DeletedWorkspaceCleanup {
  pub blob_keys: Vec<String>,
  pub comment_attachments: Vec<(String, String)>,
}

async fn load_workspace_display_name_for_mail(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
) -> Result<String, DomainError> {
  let db_name: Option<String> = sqlx::query_scalar("SELECT NULLIF(trim(name), '') FROM workspaces WHERE id = $1")
    .bind(workspace_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("load workspace name for mail: {e}")))?
    .flatten();
  if let Some(name) = db_name {
    return Ok(name);
  }
  let (yjs_name, _) = load_workspace_root_meta_in_tx(tx, workspace_id).await?;
  Ok(yjs_name.unwrap_or_else(|| "Untitled Workspace".to_owned()))
}

/// Loads `(name, avatar_key)` for `workspace_id` from the Yjs root doc
/// (`snapshots` + `updates` where `guid = workspace_id`) with fallback to the
/// `workspaces` table. Returns `Ok(None)` if neither the `workspaces` row nor
/// any root doc snapshot exists.
pub async fn load_workspace_root_meta_from_pool(
  pool: &sqlx::PgPool,
  workspace_id: &str,
) -> Result<Option<(Option<String>, Option<String>)>, DomainError> {
  let ws_row = sqlx::query("SELECT name, avatar_key FROM workspaces WHERE id = $1")
    .bind(workspace_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| DomainError::Internal(format!("load workspace meta from pool: {e}")))?;

  let mut parts: Vec<Vec<u8>> = Vec::new();
  if let Some(snap) =
    sqlx::query_scalar::<_, Vec<u8>>("SELECT blob FROM snapshots WHERE workspace_id = $1 AND guid = $1")
      .bind(workspace_id)
      .fetch_optional(pool)
      .await
      .map_err(|e| DomainError::Internal(format!("load workspace root snapshot from pool: {e}")))?
    && !snap.is_empty()
  {
    parts.push(snap);
  }
  let updates: Vec<Vec<u8>> =
    sqlx::query_scalar("SELECT blob FROM updates WHERE workspace_id = $1 AND guid = $1 ORDER BY created_at ASC")
      .bind(workspace_id)
      .fetch_all(pool)
      .await
      .map_err(|e| DomainError::Internal(format!("load workspace root updates from pool: {e}")))?;
  parts.extend(updates.into_iter().filter(|b| !b.is_empty()));

  if ws_row.is_none() && parts.is_empty() {
    return Ok(None);
  }

  let (yjs_name, yjs_avatar) = if parts.is_empty() {
    (None, None)
  } else {
    let merged = if parts.len() == 1 {
      Some(parts.remove(0))
    } else {
      y_octo::merge_updates_v1(&parts).and_then(|u| u.encode_v1()).ok()
    };
    merged
      .and_then(|bin| y_octo::Doc::try_from_binary_v1(&bin).ok())
      .and_then(|doc| doc.get_or_create_map("meta").ok())
      .map(|meta| {
        let extract = |key: &str| -> Option<String> {
          match meta.get(key) {
            Some(y_octo::Value::Any(y_octo::Any::String(raw))) => {
              let trimmed = raw.trim();
              (!trimmed.is_empty()).then(|| trimmed.to_owned())
            }
            _ => None,
          }
        };
        (extract("name"), extract("avatar"))
      })
      .unwrap_or((None, None))
  };

  let db_name = ws_row
    .as_ref()
    .and_then(|r| r.get::<Option<String>, _>("name"))
    .map(|s| s.trim().to_owned())
    .filter(|s| !s.is_empty());
  let db_avatar = ws_row
    .as_ref()
    .and_then(|r| r.get::<Option<String>, _>("avatar_key"))
    .map(|s| s.trim().to_owned())
    .filter(|s| !s.is_empty());

  Ok(Some((yjs_name.or(db_name), yjs_avatar.or(db_avatar))))
}

async fn load_workspace_root_meta_in_tx(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
) -> Result<(Option<String>, Option<String>), DomainError> {
  let mut parts: Vec<Vec<u8>> = Vec::new();
  if let Some(snap) =
    sqlx::query_scalar::<_, Vec<u8>>("SELECT blob FROM snapshots WHERE workspace_id = $1 AND guid = $1")
      .bind(workspace_id)
      .fetch_optional(&mut **tx)
      .await
      .map_err(|e| DomainError::Internal(format!("load workspace root snapshot for meta: {e}")))?
    && !snap.is_empty()
  {
    parts.push(snap);
  }
  let updates: Vec<Vec<u8>> =
    sqlx::query_scalar("SELECT blob FROM updates WHERE workspace_id = $1 AND guid = $1 ORDER BY created_at ASC")
      .bind(workspace_id)
      .fetch_all(&mut **tx)
      .await
      .map_err(|e| DomainError::Internal(format!("load workspace root updates for meta: {e}")))?;
  parts.extend(updates.into_iter().filter(|b| !b.is_empty()));
  if parts.is_empty() {
    return Ok((None, None));
  }
  let merged = if parts.len() == 1 {
    Some(parts.remove(0))
  } else {
    y_octo::merge_updates_v1(&parts).and_then(|u| u.encode_v1()).ok()
  };
  let Some(bin) = merged else {
    return Ok((None, None));
  };
  let Ok(doc) = y_octo::Doc::try_from_binary_v1(&bin) else {
    return Ok((None, None));
  };
  let Ok(meta) = doc.get_or_create_map("meta") else {
    return Ok((None, None));
  };
  let extract_str = |key: &str| -> Option<String> {
    match meta.get(key) {
      Some(y_octo::Value::Any(y_octo::Any::String(raw))) => {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
          None
        } else {
          Some(trimmed.to_owned())
        }
      }
      _ => None,
    }
  };
  Ok((extract_str("name"), extract_str("avatar")))
}

/// Computes effective storage usage (in bytes) for `workspace_id` under `grant`.
/// For `BillingSubject::Owner` (personal cloud workspaces), sums `blobs` and
/// `comment_attachments` across all personal workspaces owned by the same owner.
/// For `BillingSubject::Workspace`, sums only `workspace_id`.
pub async fn load_effective_storage_usage_in_tx(
  tx: &mut Transaction<'_, Postgres>,
  quota_gate: &dyn QuotaGate,
  workspace_id: &str,
  grant: &server_types::AccessGrant,
  now: DateTime<Utc>,
) -> Result<i64, DomainError> {
  if grant.billing_subject == server_types::BillingSubject::Owner {
    let owner_id: Option<String> = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND role = 'owner' AND state = 'active' LIMIT 1",
    )
    .bind(workspace_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("load owner for storage usage: {e}")))?;

    if let Some(owner_id) = owner_id {
      let owned_ws_ids: Vec<(String, bool)> = sqlx::query_as(
        r#"SELECT
             wm.workspace_id,
             (
               EXISTS (
                 SELECT 1
                 FROM entitlements e
                 WHERE e.target_type = 'workspace'
                   AND e.target_id = wm.workspace_id
                   AND e.status IN ('active', 'grace')
                   AND (e.starts_at IS NULL OR e.starts_at <= $2)
                   AND (e.expires_at IS NULL OR e.expires_at > $2 OR e.grace_until > $2)
               )
               OR EXISTS (
                 SELECT 1
                 FROM installed_licenses il
                 WHERE il.workspace_id = wm.workspace_id
               )
             ) AS has_candidate_entitlement
           FROM workspace_members wm
           WHERE wm.user_id = $1
             AND wm.role = 'owner'
             AND wm.state = 'active'
           ORDER BY wm.workspace_id"#,
      )
      .bind(&owner_id)
      .bind(now)
      .fetch_all(&mut **tx)
      .await
      .map_err(|e| DomainError::Internal(format!("list owner workspaces for storage usage: {e}")))?;

      let mut personal_ws_ids = Vec::with_capacity(owned_ws_ids.len());
      for (ws_id, has_candidate_entitlement) in owned_ws_ids {
        if ws_id == workspace_id || !has_candidate_entitlement {
          personal_ws_ids.push(ws_id);
        } else {
          let ws_grant = quota_gate.resolve_workspace_grant(tx, &ws_id, now).await?;
          if ws_grant.billing_subject == server_types::BillingSubject::Owner {
            personal_ws_ids.push(ws_id);
          }
        }
      }
      if !personal_ws_ids.is_empty() {
        let used: i64 = sqlx::query_scalar(
          r#"SELECT
               COALESCE(
                 (SELECT SUM(size)::bigint
                  FROM blobs
                  WHERE workspace_id = ANY($1)
                    AND deleted_at IS NULL
                    AND (status = 'completed' OR (status = 'pending' AND reservation_expires_at > clock_timestamp()))),
                 0
               )
               + COALESCE(
                 (SELECT SUM(size)::bigint
                  FROM comment_attachments
                  WHERE workspace_id = ANY($1)
                    AND deleted_at IS NULL
                    AND (status = 'completed' OR (status = 'pending' AND reservation_expires_at > clock_timestamp()))),
                 0
               )"#,
        )
        .bind(&personal_ws_ids)
        .fetch_one(&mut **tx)
        .await
        .map_err(|e| DomainError::Internal(format!("load owner storage usage: {e}")))?;
        return Ok(used);
      }
    }
  }

  sqlx::query_scalar(
    r#"SELECT
         COALESCE(
           (SELECT SUM(size)::bigint
            FROM blobs
            WHERE workspace_id = $1
              AND deleted_at IS NULL
              AND (status = 'completed' OR (status = 'pending' AND reservation_expires_at > clock_timestamp()))),
           0
         )
         + COALESCE(
           (SELECT SUM(size)::bigint
            FROM comment_attachments
            WHERE workspace_id = $1
              AND deleted_at IS NULL
              AND (status = 'completed' OR (status = 'pending' AND reservation_expires_at > clock_timestamp()))),
           0
         )"#,
  )
  .bind(workspace_id)
  .fetch_one(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("load workspace storage usage: {e}")))
}

async fn lock_workspace_row(tx: &mut Transaction<'_, Postgres>, workspace_id: &str) -> Result<(), DomainError> {
  let exists: Option<String> = sqlx::query_scalar("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE")
    .bind(workspace_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("lock workspace row: {e}")))?;
  if exists.is_none() {
    return Err(DomainError::NotFound(format!("workspace {workspace_id} not found")));
  }
  Ok(())
}

async fn require_active_member_role(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  user_id: &str,
) -> Result<WorkspaceRole, DomainError> {
  let role: Option<String> = sqlx::query_scalar(
    "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active' FOR UPDATE",
  )
  .bind(workspace_id)
  .bind(user_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("load active member role: {e}")))?;
  let Some(role) = role else {
    return Err(DomainError::Forbidden(
      "user is not an active workspace member".to_owned(),
    ));
  };
  WorkspaceRole::parse(&role)
}

async fn count_charged_seats_in_tx(tx: &mut Transaction<'_, Postgres>, workspace_id: &str) -> Result<i32, DomainError> {
  let count: i32 = sqlx::query_scalar(
    r#"SELECT
         (SELECT COUNT(*)::int FROM workspace_members WHERE workspace_id = $1 AND state = 'active')
         + (SELECT COUNT(*)::int FROM workspace_invitations WHERE workspace_id = $1 AND status::text = ANY($2))"#,
  )
  .bind(workspace_id)
  .bind(CHARGEABLE_INVITATION_STATUSES.as_slice())
  .fetch_one(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("count charged workspace seats: {e}")))?;
  Ok(count)
}

fn row_to_workspace(row: sqlx::postgres::PgRow) -> WorkspaceRecord {
  WorkspaceRecord {
    id: row.get("id"),
    sid: row.get("sid"),
    name: row.get("name"),
    avatar_key: row.get("avatar_key"),
    public: row.get("is_public"),
    enable_ai: row.get("enable_ai"),
    enable_doc_embedding: row.get("enable_doc_embedding"),
    enable_sharing: row.get("enable_sharing"),
    enable_url_preview: row.get("enable_url_preview"),
    indexed: row.get("indexed"),
    created_at: row.get("created_at"),
    last_check_embeddings: row.get("last_check_embeddings"),
  }
}

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

fn validate_workspace_init_update(bytes: &[u8]) -> Result<(), DomainError> {
  const MAX_INIT_BYTES: usize = 16 * 1024 * 1024;
  if bytes.len() > MAX_INIT_BYTES {
    return Err(DomainError::Validation("workspace init document is too large".into()));
  }
  y_octo::ReadDoc::from_full_update_v1(bytes.to_vec())
    .map_err(|err| DomainError::Validation(format!("invalid Yjs document update: {err}")))?;

  let mut sink = RejectZeroLengthSink::default();
  let limits = y_octo_core::decoder_v1::DecodeLimitsCore::default_update();
  if y_octo_core::decoder_v1::decode_update_v1(bytes, &mut sink, &limits).is_err() || sink.saw_zero_length {
    return Err(DomainError::Validation(
      "invalid Yjs document update: zero-length struct".into(),
    ));
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn push_varuint(out: &mut Vec<u8>, mut value: u64) {
    loop {
      let mut byte = (value & 0x7f) as u8;
      value >>= 7;
      if value != 0 {
        byte |= 0x80;
      }
      out.push(byte);
      if value == 0 {
        break;
      }
    }
  }

  fn push_varstring(out: &mut Vec<u8>, s: &str) {
    push_varuint(out, s.len() as u64);
    out.extend_from_slice(s.as_bytes());
  }

  /// Synthetic Yjs v1 update with a zero-length `ContentString("")`
  /// at the outer end of a `Y.Text` sequence, strictly covered by a delete range.
  fn synthetic_deleted_zero_len_string_update(client: u64) -> Vec<u8> {
    let mut buf = Vec::new();
    push_varuint(&mut buf, 1); // 1 client
    push_varuint(&mut buf, 4); // 4 structs
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 0); // start clock = 0
    // Struct 0 (clock 0, len 1): ContentType(Y.Text, kind=2) under named root.
    buf.push(0x07);
    buf.push(0x01);
    push_varstring(&mut buf, "legacy_zero_str");
    push_varuint(&mut buf, 2);
    // Struct 1 (clock 1, len 1): ContentString("a") in Y.Text(client, 0).
    buf.push(0x04);
    buf.push(0x00);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 0);
    push_varstring(&mut buf, "a");
    // Struct 2 (clock 2, len 0): ContentString("") with origin_left = (client, 1).
    buf.push(0x84);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 1);
    push_varstring(&mut buf, "");
    // Struct 3 (clock 2, len 1): ContentString("b") in Y.Text(client, 0).
    buf.push(0x04);
    buf.push(0x00);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 0);
    push_varstring(&mut buf, "b");
    // Delete set: [1, 3) strictly covers clock 2.
    push_varuint(&mut buf, 1);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 1);
    push_varuint(&mut buf, 1);
    push_varuint(&mut buf, 2);
    buf
  }

  /// Synthetic Yjs v1 update with a Yjs re-encoded `ContentDeleted(0)`
  /// at the outer end of a `Y.Text` sequence.
  fn synthetic_zero_len_deleted_update(client: u64) -> Vec<u8> {
    let mut buf = Vec::new();
    push_varuint(&mut buf, 1); // 1 client
    push_varuint(&mut buf, 3); // 3 structs
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 0); // start clock = 0
    // Struct 0 (clock 0, len 1): ContentType(Y.Text, kind=2) under named root.
    buf.push(0x07);
    buf.push(0x01);
    push_varstring(&mut buf, "legacy_zero_del");
    push_varuint(&mut buf, 2);
    // Struct 1 (clock 1, len 1): ContentString("x") in Y.Text(client, 0).
    buf.push(0x04);
    buf.push(0x00);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 0);
    push_varstring(&mut buf, "x");
    // Struct 2 (clock 2, len 0): ContentDeleted(0) with origin_left = (client, 1).
    buf.push(0x81);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 1);
    push_varuint(&mut buf, 0);
    // Empty delete set.
    push_varuint(&mut buf, 0);
    buf
  }

  #[test]
  fn validate_workspace_init_update_rejects_zero_length_struct_frames() {
    let doc = y_octo::Doc::with_client(1);
    let mut meta = doc.get_or_create_map("meta").unwrap();
    meta
      .insert("name".to_owned(), y_octo::Any::String("init-ws".into()))
      .unwrap();
    let valid = doc.encode_update_v1().unwrap();
    validate_workspace_init_update(&valid).expect("normal init update must pass");

    let zero_str = synthetic_deleted_zero_len_string_update(900_001);
    let zero_del = synthetic_zero_len_deleted_update(900_002);

    // Step 1: Historical zero-length samples remain readable via ReadDoc.
    let read_zero_str = y_octo::ReadDoc::from_full_update_v1(zero_str.clone())
      .expect("historical zero-length string frame must remain readable via ReadDoc");
    assert!(read_zero_str.array("legacy_zero_str").is_some());

    let read_zero_del = y_octo::ReadDoc::from_full_update_v1(zero_del.clone())
      .expect("historical zero-length deleted frame must remain readable via ReadDoc");
    let nested_del = read_zero_del
      .array("legacy_zero_del")
      .and_then(|arr| arr.get(0))
      .and_then(|val| match val {
        y_octo::ReadValue::Text(t) => Some(t.to_string()),
        _ => None,
      });
    assert_eq!(nested_del.as_deref(), Some("x"));

    // Step 2: Write-boundary decode_update_v1 + RejectZeroLengthSink strictly rejects both.
    for sample in [&zero_str, &zero_del] {
      let err = validate_workspace_init_update(sample).unwrap_err();
      assert!(
        matches!(err, DomainError::Validation(ref msg) if msg == "invalid Yjs document update: zero-length struct"),
        "expected step-2 write-boundary zero-length struct rejection, got: {err:?}"
      );
    }
  }
}
