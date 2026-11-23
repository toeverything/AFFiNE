//! Canonical workspace, membership/ACL, and usage query domain service.

use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use server_db::{ServerDb, WorkloadTier};
use server_spi::{CommunityRateLimitPolicy, QuotaGate, RateLimitPolicy, RequestSource};
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

#[derive(Clone)]
pub struct WorkspaceService {
  db: ServerDb,
  quota_gate: Arc<dyn QuotaGate>,
  invalidation: Arc<dyn InvalidationPublisher>,
  rate_limit_policy: Arc<dyn RateLimitPolicy>,
}

impl WorkspaceService {
  pub fn new(db: ServerDb, quota_gate: Arc<dyn QuotaGate>, invalidation: Arc<dyn InvalidationPublisher>) -> Self {
    Self {
      db,
      quota_gate,
      invalidation,
      rate_limit_policy: Arc::new(CommunityRateLimitPolicy),
    }
  }

  pub fn with_rate_limit_policy(mut self, rate_limit_policy: Arc<dyn RateLimitPolicy>) -> Self {
    self.rate_limit_policy = rate_limit_policy;
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
    if !workspace.public {
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

    let _ = self
      .invalidation
      .publish_invalidation(&InvalidationHintV1::WorkspaceInventoryChanged {
        workspace_id: workspace_id.to_owned(),
        doc_id: None,
      })
      .await;

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

    // Deadlock-free lock order matching `accept_invitation` & `v0.27.5` `strict_quota/seat.rs`:
    // 1) lock sorted `users` (`owner_id`, `actor_user_id`, all matched `invitee_user_id`s)
    // 2) lock `workspaces`
    // 3) re-verify `owner_id`, workspace name, & `invitee_user_id` stability under locks.
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
      self
        .rate_limit_policy
        .check_workspace_invite(tx.tx_mut(), workspace_id, actor_user_id, &candidate_refs, source, now)
        .await?;

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

      for (idx, email, invitee_user_id) in candidates {
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

      let _ = self
        .invalidation
        .publish_invalidation(&InvalidationHintV1::QuotaSeatUsage {
          workspace_id: workspace_id.to_owned(),
        })
        .await;
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

  /// Accepts a pending workspace invitation for `invitee_user_id`, following the
  /// exact `v0.27.5` `strict_quota/seat.rs` deadlock-free lock order
  /// (`users (sorted) -> workspaces -> workspace_invitations`), re-verifying
  /// owner stability, expiry, strict identity binding, and seat quota before
  /// activating `workspace_members` with `id = invitation_id, source = kind`
  /// and deleting the consumed `workspace_invitations` row.
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

    let inv_workspace_id: String = sqlx::query_scalar("SELECT workspace_id FROM workspace_invitations WHERE id = $1")
      .bind(invitation_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load invitation workspace: {e}")))?
      .ok_or_else(|| DomainError::NotFound("invitation not found".to_owned()))?;

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
      r#"SELECT id, workspace_id, invitee_user_id, normalized_email,
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

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit accept_invitation: {e}")))?;

    let _ = self
      .invalidation
      .publish_invalidation(&InvalidationHintV1::QuotaSeatUsage {
        workspace_id: inv_workspace_id.clone(),
      })
      .await;

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

  /// Updates an active workspace member's role (including ownership transfer).
  pub async fn update_member_role(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    target_user_id: &str,
    new_role: WorkspaceRole,
  ) -> Result<WorkspaceMemberRecord, DomainError> {
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
    let target_role = require_active_member_role(tx.tx_mut(), workspace_id, target_user_id).await?;
    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, now)
      .await?;
    let effective_actor_role = actor_role.effective(grant.rights.commercial);

    if target_role == WorkspaceRole::Owner {
      return Err(DomainError::Forbidden("workspace_owner_must_transfer".to_owned()));
    }
    if new_role == WorkspaceRole::Owner && effective_actor_role != WorkspaceRole::Owner {
      return Err(DomainError::Forbidden(
        "only workspace owner may transfer ownership".to_owned(),
      ));
    }
    if !matches!(effective_actor_role, WorkspaceRole::Owner | WorkspaceRole::Admin) {
      return Err(DomainError::Forbidden(
        "insufficient permissions to change member role".to_owned(),
      ));
    }
    if effective_actor_role == WorkspaceRole::Admin && target_role == WorkspaceRole::Admin {
      return Err(DomainError::Forbidden(
        "admin cannot modify another admin's role".to_owned(),
      ));
    }

    if new_role == WorkspaceRole::Owner {
      sqlx::query(
        "UPDATE workspace_members
         SET role = 'admin', updated_at = clock_timestamp()
         WHERE workspace_id = $1 AND role = 'owner' AND state = 'active' AND user_id <> $2",
      )
      .bind(workspace_id)
      .bind(target_user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("demote previous owner: {e}")))?;
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

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit update_member_role: {e}")))?;

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

    let deleted_invites = sqlx::query(
      "DELETE FROM workspace_invitations
       WHERE workspace_id = $1
         AND (
           invitee_user_id = $2
           OR (invitee_user_id IS NULL AND $3::text IS NOT NULL AND lower(normalized_email) = lower($3))
         )",
    )
    .bind(workspace_id)
    .bind(target_user_id)
    .bind(target_email.as_deref())
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("delete workspace invitation: {e}")))?
    .rows_affected();

    if deleted_members == 0 && deleted_invites == 0 {
      return Err(DomainError::NotFound("workspace_member_not_found".to_owned()));
    }

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit revoke_member: {e}")))?;

    let _ = self
      .invalidation
      .publish_invalidation(&InvalidationHintV1::QuotaSeatUsage {
        workspace_id: workspace_id.to_owned(),
      })
      .await;

    Ok(())
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

    let used_storage_quota: i64 = sqlx::query_scalar(
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
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load workspace storage usage: {e}")))?;

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
