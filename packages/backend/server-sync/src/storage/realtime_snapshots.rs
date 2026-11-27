//! Realtime snapshot queries and commercial Copilot realtime delegation for [`SyncStorage`].

use chrono::{DateTime, Duration, Utc};
use server_db::WorkloadTier;
use server_types::{BillingSubject, LicenseTier};
use sqlx::Row as _;

use super::SyncStorage;
use crate::{error::SyncError, permissions::WorkspaceRole};

fn external_plan_name(tier: LicenseTier) -> &'static str {
  match tier {
    LicenseTier::CloudFree => "free",
    LicenseTier::CloudPro => "pro",
    LicenseTier::CloudLifetimePro => "lifetime_pro",
    LicenseTier::CloudAi => "ai",
    LicenseTier::CloudTeam => "team",
    LicenseTier::SelfhostDefault => "selfhost_free",
    LicenseTier::SelfhostTeam => "selfhost_team",
    LicenseTier::SelfhostEnterprise => "selfhost_enterprise",
  }
}

fn escape_like_pattern(raw: &str) -> String {
  let mut out = String::with_capacity(raw.len());
  for ch in raw.chars() {
    match ch {
      '\\' | '%' | '_' => {
        out.push('\\');
        out.push(ch);
      }
      _ => out.push(ch),
    }
  }
  out
}

impl SyncStorage {
  /// Resolves the `user.profile.get` realtime snapshot (`CurrentUserProfileSnapshot`).
  pub async fn get_user_profile_snapshot(&self, user_id: &str) -> Result<serde_json::Value, SyncError> {
    let mut conn = self.db.acquire_tiered(WorkloadTier::InteractiveRead).await?;
    let row = sqlx::query(
      "SELECT id, name, email, avatar_url, email_verified, (password IS NOT NULL) AS has_password \
       FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(&mut *conn)
    .await?;
    let Some(row) = row else {
      return Err(SyncError::AuthenticationRequired("user not found".into()));
    };
    let raw_features: Vec<String> = sqlx::query_scalar(
      "SELECT DISTINCT name FROM user_features \
       WHERE user_id = $1 AND activated = true AND (expired_at IS NULL OR expired_at > clock_timestamp()) \
       ORDER BY name ASC",
    )
    .bind(user_id)
    .fetch_all(&mut *conn)
    .await?;
    let features: Vec<String> = raw_features
      .into_iter()
      .map(|f| match f.as_str() {
        "administrator" => "Admin".to_owned(),
        _ => f,
      })
      .collect();
    let email_verified: Option<DateTime<Utc>> = row.get("email_verified");
    Ok(serde_json::json!({
      "id": row.get::<String, _>("id"),
      "name": row.get::<String, _>("name"),
      "email": row.get::<String, _>("email"),
      "emailVerified": email_verified.is_some(),
      "hasPassword": row.get::<bool, _>("has_password"),
      "avatarUrl": row.get::<Option<String>, _>("avatar_url"),
      "features": features,
    }))
  }

  /// Authorizes `Workspace.Users.Manage` (workspace owner or commercial admin).
  pub async fn assert_workspace_invite_manage(&self, workspace_id: &str, actor_user_id: &str) -> Result<(), SyncError> {
    let mut tx = self.db.begin_tiered(WorkloadTier::InteractiveRead).await?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await?;
    let member_role_str: Option<String> = sqlx::query_scalar(
      "SELECT role::text FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active'",
    )
    .bind(workspace_id)
    .bind(actor_user_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await?;
    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, now)
      .await
      .map_err(|e| SyncError::Internal(format!("resolve workspace grant for invite manage: {e}")))?;
    let _ = tx.rollback().await;
    let role = member_role_str.as_deref().and_then(WorkspaceRole::parse);
    let allowed = matches!(role, Some(WorkspaceRole::Owner))
      || (grant.rights.commercial && matches!(role, Some(WorkspaceRole::Admin)));
    if !allowed {
      return Err(SyncError::AccessDenied(
        "Workspace.Users.Manage permission required.".into(),
      ));
    }
    Ok(())
  }

  pub async fn get_workspace_members_snapshot(
    &self,
    workspace_id: &str,
    actor_user_id: &str,
    skip: i64,
    take: i64,
    query: Option<&str>,
  ) -> Result<serde_json::Value, SyncError> {
    self
      .assert_workspace_members_readable(workspace_id, actor_user_id)
      .await?;
    if let Some(q) = query
      && q.encode_utf16().count() > 255
    {
      return Err(SyncError::QueryTooLong { max: 255 });
    }
    let clamped_skip = skip.max(0);
    let clamped_take = take.clamp(1, 100);
    let mut conn = self.db.acquire_tiered(WorkloadTier::InteractiveRead).await?;
    let kw = query
      .map(str::trim)
      .filter(|s| !s.is_empty())
      .map(|s| format!("%{}%", escape_like_pattern(&s.to_ascii_lowercase())));
    let member_count: i64 = sqlx::query_scalar(
      "SELECT (
         (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = $1 AND state = 'active')
         + (SELECT COUNT(*) FROM workspace_invitations WHERE workspace_id = $1)
       )::bigint",
    )
    .bind(workspace_id)
    .fetch_one(&mut *conn)
    .await?;
    let rows = sqlx::query(
      r#"SELECT * FROM (
           SELECT u.id AS user_id, u.name, u.email, u.avatar_url,
                  m.role::text AS role,
                  u.id AS invite_id,
                  'Accepted'::text AS status,
                  m.created_at AS sort_at
           FROM workspace_members m
           JOIN users u ON u.id = m.user_id
           WHERE m.workspace_id = $1 AND m.state = 'active'
           UNION ALL
           SELECT u.id AS user_id,
                  u.name,
                  u.email,
                  u.avatar_url,
                  i.requested_role::text AS role,
                  u.id AS invite_id,
                  CASE i.status::text
                    WHEN 'waiting_review' THEN 'UnderReview'
                    WHEN 'waiting_seat' THEN 'NeedMoreSeat'
                    ELSE 'Pending'
                  END AS status,
                  i.created_at AS sort_at
           FROM workspace_invitations i
           INNER JOIN users u ON u.id = i.invitee_user_id
           WHERE i.workspace_id = $1
         ) combined
         WHERE ($2::text IS NULL OR lower(combined.name) LIKE $2 ESCAPE '\' OR lower(combined.email) LIKE $2 ESCAPE '\')
         ORDER BY combined.sort_at ASC, combined.user_id ASC
         OFFSET $3 LIMIT $4"#,
    )
    .bind(workspace_id)
    .bind(kw.as_deref())
    .bind(clamped_skip)
    .bind(clamped_take)
    .fetch_all(&mut *conn)
    .await?;
    let members: Vec<serde_json::Value> = rows
      .into_iter()
      .map(|r| {
        let role_str: String = r.get("role");
        let role_name = match role_str.as_str() {
          "owner" => "Owner",
          "admin" => "Admin",
          "collaborator" | "member" => "Collaborator",
          _ => "External",
        };
        serde_json::json!({
          "id": r.get::<String, _>("user_id"),
          "name": r.get::<String, _>("name"),
          "email": r.get::<String, _>("email"),
          "avatarUrl": r.get::<Option<String>, _>("avatar_url"),
          "permission": role_name,
          "role": role_name,
          "inviteId": r.get::<String, _>("invite_id"),
          "emailVerified": serde_json::Value::Null,
          "status": r.get::<String, _>("status"),
        })
      })
      .collect();
    Ok(serde_json::json!({
      "members": members,
      "memberCount": member_count,
    }))
  }

  pub async fn get_workspace_invite_link_snapshot(
    &self,
    workspace_id: &str,
    actor_user_id: &str,
  ) -> Result<serde_json::Value, SyncError> {
    self.assert_workspace_invite_manage(workspace_id, actor_user_id).await?;
    let Some(client) = &self.cache_redis else {
      return Ok(serde_json::Value::Null);
    };
    let mut conn = self.cache_redis_conn.lock().await.clone();
    if conn.is_none() {
      conn = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        client.get_multiplexed_async_connection(),
      )
      .await
      .ok()
      .and_then(Result::ok);
    }
    let Some(mut conn) = conn else {
      return Ok(serde_json::Value::Null);
    };
    let ws_key = format!("workspace:inviteLink:{workspace_id}");
    let raw_res = tokio::time::timeout(
      std::time::Duration::from_secs(2),
      redis::cmd("GET").arg(&ws_key).query_async::<Option<String>>(&mut conn),
    )
    .await;
    let Ok(Ok(raw_opt)) = raw_res else {
      *self.cache_redis_conn.lock().await = None;
      return Ok(serde_json::Value::Null);
    };
    *self.cache_redis_conn.lock().await = Some(conn.clone());
    let Some(raw) = raw_opt else {
      return Ok(serde_json::Value::Null);
    };
    let pttl: i64 = tokio::time::timeout(
      std::time::Duration::from_secs(2),
      redis::cmd("PTTL").arg(&ws_key).query_async::<i64>(&mut conn),
    )
    .await
    .ok()
    .and_then(Result::ok)
    .unwrap_or(-1);
    if pttl <= 0 {
      return Ok(serde_json::Value::Null);
    }
    let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();
    let Some(invite_id) = parsed
      .get("inviteId")
      .and_then(|v| v.as_str())
      .filter(|s| !s.is_empty())
    else {
      return Ok(serde_json::Value::Null);
    };
    let base = self.external_url.trim_end_matches('/');
    let link = if base.is_empty() {
      format!("/invite/{invite_id}")
    } else {
      format!("{base}/invite/{invite_id}")
    };
    let expire_time = (Utc::now() + Duration::milliseconds(pttl)).to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    Ok(serde_json::json!({
      "link": link,
      "expireTime": expire_time,
    }))
  }

  async fn resolve_owner_billed_workspace_ids(
    &self,
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    owner_user_id: &str,
    now: DateTime<Utc>,
  ) -> Result<Vec<String>, SyncError> {
    let candidate_ws_ids: Vec<String> = sqlx::query_scalar(
      "SELECT workspace_id FROM workspace_members \
       WHERE user_id = $1 AND role = 'owner' AND state = 'active' \
       ORDER BY workspace_id",
    )
    .bind(owner_user_id)
    .fetch_all(&mut **tx)
    .await?;
    let mut owner_billed = Vec::with_capacity(candidate_ws_ids.len());
    for ws_id in candidate_ws_ids {
      let ws_grant = self
        .quota_gate
        .resolve_workspace_grant(tx, &ws_id, now)
        .await
        .map_err(|e| SyncError::Internal(format!("resolve owner workspace grant {ws_id}: {e}")))?;
      if ws_grant.billing_subject == BillingSubject::Owner {
        owner_billed.push(ws_id);
      }
    }
    Ok(owner_billed)
  }

  pub async fn get_user_quota_state_snapshot(&self, user_id: &str) -> Result<serde_json::Value, SyncError> {
    let mut tx = self.db.begin_tiered(WorkloadTier::InteractiveRead).await?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await?;
    let grant = self
      .quota_gate
      .resolve_user_grant(tx.tx_mut(), user_id, now)
      .await
      .map_err(|e| SyncError::Internal(format!("resolve user quota grant: {e}")))?;
    let personal_ws_ids = self
      .resolve_owner_billed_workspace_ids(tx.tx_mut(), user_id, now)
      .await?;
    let used_storage: i64 = if personal_ws_ids.is_empty() {
      0
    } else {
      sqlx::query_scalar(
        "SELECT (
           COALESCE((
             SELECT SUM(b.size)::bigint FROM blobs b
             WHERE b.workspace_id = ANY($1) AND b.deleted_at IS NULL
               AND (b.status = 'completed' OR (b.status = 'pending' AND b.reservation_expires_at > $2))
           ), 0)
           + COALESCE((
             SELECT SUM(ca.size)::bigint FROM comment_attachments ca
             WHERE ca.workspace_id = ANY($1) AND ca.deleted_at IS NULL
               AND (ca.status = 'completed' OR (ca.status = 'pending' AND ca.reservation_expires_at > $2))
           ), 0)
         )::bigint",
      )
      .bind(&personal_ws_ids)
      .bind(now)
      .fetch_one(&mut **tx.tx_mut())
      .await?
    };
    let _ = tx.rollback().await;
    Ok(serde_json::json!({
      "plan": external_plan_name(grant.tier),
      "seatLimit": grant.limits.seat_limit,
      "blobLimit": grant.limits.blob_limit_bytes,
      "storageQuota": grant.limits.storage_quota_bytes,
      "usedStorageQuota": used_storage,
      "historyPeriodSeconds": grant.limits.history_period_seconds,
      "copilotActionLimit": grant.limits.copilot_action_limit,
      "unlimitedCopilot": grant.rights.unlimited_copilot,
    }))
  }

  pub async fn get_workspace_quota_state_snapshot(
    &self,
    workspace_id: &str,
    actor_user_id: &str,
  ) -> Result<serde_json::Value, SyncError> {
    self.assert_workspace_readable(workspace_id, actor_user_id).await?;
    let mut tx = self.db.begin_tiered(WorkloadTier::InteractiveRead).await?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await?;
    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, now)
      .await
      .map_err(|e| SyncError::Internal(format!("resolve workspace quota grant: {e}")))?;
    let owner_user_id: String = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members \
       WHERE workspace_id = $1 AND role = 'owner' AND state = 'active' \
       ORDER BY created_at ASC LIMIT 1",
    )
    .bind(workspace_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await?
    .unwrap_or_default();
    let uses_owner_quota = grant.billing_subject == BillingSubject::Owner;
    let storage_ws_ids: Vec<String> = if uses_owner_quota && !owner_user_id.is_empty() {
      self
        .resolve_owner_billed_workspace_ids(tx.tx_mut(), &owner_user_id, now)
        .await?
    } else {
      vec![workspace_id.to_owned()]
    };
    let used_storage: i64 = if storage_ws_ids.is_empty() {
      0
    } else {
      sqlx::query_scalar(
        "SELECT (
           COALESCE((
             SELECT SUM(b.size)::bigint FROM blobs b
             WHERE b.workspace_id = ANY($1) AND b.deleted_at IS NULL
               AND (b.status = 'completed' OR (b.status = 'pending' AND b.reservation_expires_at > $2))
           ), 0)
           + COALESCE((
             SELECT SUM(ca.size)::bigint FROM comment_attachments ca
             WHERE ca.workspace_id = ANY($1) AND ca.deleted_at IS NULL
               AND (ca.status = 'completed' OR (ca.status = 'pending' AND ca.reservation_expires_at > $2))
           ), 0)
         )::bigint",
      )
      .bind(&storage_ws_ids)
      .bind(now)
      .fetch_one(&mut **tx.tx_mut())
      .await?
    };
    let chargeable_statuses = ["pending", "waiting_review", "waiting_seat"];
    let member_count: i64 = sqlx::query_scalar(
      "SELECT (
         (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = $1 AND state = 'active')
         + (SELECT COUNT(*) FROM workspace_invitations WHERE workspace_id = $1 AND status::text = ANY($2))
       )::bigint",
    )
    .bind(workspace_id)
    .bind(chargeable_statuses.as_slice())
    .fetch_one(&mut **tx.tx_mut())
    .await?;
    let _ = tx.rollback().await;
    let overcapacity_member_count = (member_count - i64::from(grant.limits.seat_limit)).max(0);
    let mut readonly_reasons: Vec<&'static str> = Vec::new();
    if overcapacity_member_count > 0 {
      readonly_reasons.push("member_overflow");
    }
    if grant.limits.storage_quota_bytes >= 0 && used_storage > grant.limits.storage_quota_bytes {
      readonly_reasons.push("storage_overflow");
    }
    let readonly = !readonly_reasons.is_empty();
    Ok(serde_json::json!({
      "plan": external_plan_name(grant.tier),
      "ownerUserId": owner_user_id,
      "usesOwnerQuota": uses_owner_quota,
      "seatLimit": grant.limits.seat_limit,
      "memberCount": member_count,
      "overcapacityMemberCount": overcapacity_member_count,
      "blobLimit": grant.limits.blob_limit_bytes,
      "storageQuota": grant.limits.storage_quota_bytes,
      "usedStorageQuota": used_storage,
      "historyPeriodSeconds": grant.limits.history_period_seconds,
      "readonly": readonly,
      "readonlyReasons": readonly_reasons,
      "unlimitedCopilot": grant.rights.unlimited_copilot,
    }))
  }

  pub async fn copilot_realtime_get_transcript_task(
    &self,
    user_id: &str,
    workspace_id: &str,
    blob_id: Option<&str>,
    task_id: Option<&str>,
  ) -> Result<serde_json::Value, SyncError> {
    let Some(handler) = &self.copilot_realtime else {
      return Err(SyncError::CopilotDisabled);
    };
    handler
      .get_transcript_task(user_id, workspace_id, blob_id, task_id)
      .await
  }

  pub async fn copilot_realtime_retry_transcript_task(
    &self,
    user_id: &str,
    workspace_id: &str,
    task_id: &str,
  ) -> Result<serde_json::Value, SyncError> {
    let Some(handler) = &self.copilot_realtime else {
      return Err(SyncError::CopilotDisabled);
    };
    handler.retry_transcript_task(user_id, workspace_id, task_id).await
  }

  pub async fn copilot_realtime_authorize_transcript_task(
    &self,
    user_id: &str,
    workspace_id: &str,
    task_id: &str,
  ) -> Result<(), SyncError> {
    let Some(handler) = &self.copilot_realtime else {
      return Err(SyncError::CopilotDisabled);
    };
    handler.authorize_transcript_task(user_id, workspace_id, task_id).await
  }

  pub async fn copilot_realtime_get_embedding_progress(
    &self,
    user_id: &str,
    workspace_id: &str,
  ) -> Result<serde_json::Value, SyncError> {
    let Some(handler) = &self.copilot_realtime else {
      return Err(SyncError::CopilotDisabled);
    };
    handler.get_embedding_progress(user_id, workspace_id).await
  }

  pub async fn copilot_realtime_authorize_embedding_progress(
    &self,
    user_id: &str,
    workspace_id: &str,
  ) -> Result<(), SyncError> {
    let Some(handler) = &self.copilot_realtime else {
      return Err(SyncError::CopilotDisabled);
    };
    handler.authorize_embedding_progress(user_id, workspace_id).await
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn external_plan_name_and_like_escaping() {
    assert_eq!(external_plan_name(LicenseTier::CloudFree), "free");
    assert_eq!(external_plan_name(LicenseTier::CloudPro), "pro");
    assert_eq!(external_plan_name(LicenseTier::CloudLifetimePro), "lifetime_pro");
    assert_eq!(external_plan_name(LicenseTier::CloudAi), "ai");
    assert_eq!(external_plan_name(LicenseTier::CloudTeam), "team");
    assert_eq!(external_plan_name(LicenseTier::SelfhostDefault), "selfhost_free");
    assert_eq!(external_plan_name(LicenseTier::SelfhostTeam), "selfhost_team");
    assert_eq!(
      external_plan_name(LicenseTier::SelfhostEnterprise),
      "selfhost_enterprise"
    );
    assert_eq!(escape_like_pattern(r"a%b_c\d"), r"a\%b\_c\\d");
  }

  #[test]
  fn realtime_snapshots_members_and_quota_state_pg() {
    use std::path::Path;

    use server_db::{DbConfig, ServerDb};
    use server_spi::{CommunityExtension, ServerExtension as _};
    use server_types::ServerRole;
    use test_db_harness::{
      migrations::MigrationSet,
      pg::{DEFAULT_LEASE_TTL, PgCluster},
    };

    let cluster = PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
    let migrations = MigrationSet::load(&migrations_dir).expect("load migrations");
    let template = cluster.ensure_template(&migrations).expect("ensure template");
    let lease = cluster.lease(&template, DEFAULT_LEASE_TTL).expect("lease db");

    let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
    rt.block_on(async {
      let db = ServerDb::connect(DbConfig {
        database_url: lease.url().to_owned(),
        channel: "production".into(),
        role: ServerRole::Allinone,
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

      let ext = CommunityExtension::new();
      let storage = SyncStorage::with_quota_gate(db.clone(), ext.quota_gate());

      let owner_id = "usr_rt_owner";
      let member_id = "usr_rt_member";
      let invited_user_id = "usr_rt_invited";
      let ws_id = "ws_rt_snap";
      for (uid, name, email) in [
        (owner_id, "Owner User", "owner-rt@example.com"),
        (member_id, "Active Member", "member-rt@example.com"),
        (invited_user_id, "Invited User", "invited-rt@example.com"),
      ] {
        sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, $2, $3)")
          .bind(uid)
          .bind(name)
          .bind(email)
          .execute(db.pool())
          .await
          .expect("insert user");
      }
      sqlx::query("INSERT INTO workspaces (id, name) VALUES ($1, 'RT WS')")
        .bind(ws_id)
        .execute(db.pool())
        .await
        .expect("insert workspace");
      sqlx::query(
        "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES \
         ('wm_1', $1, $2, 'owner', 'active', 'legacy'), \
         ('wm_2', $1, $3, 'member', 'active', 'legacy')",
      )
      .bind(ws_id)
      .bind(owner_id)
      .bind(member_id)
      .execute(db.pool())
      .await
      .expect("insert members");
      // One linked-user invitation + one pure-email invitation (invitee_user_id IS NULL).
      sqlx::query(
        "INSERT INTO workspace_invitations \
         (id, workspace_id, inviter_user_id, invitee_user_id, normalized_email, requested_role, status, kind, created_at, updated_at) VALUES \
         ('inv_linked', $1, $2, $3, 'invited-rt@example.com', 'member', 'pending', 'email', now(), now()), \
         ('inv_email_only', $1, $2, NULL, 'pure-email@example.com', 'member', 'pending', 'email', now(), now())",
      )
      .bind(ws_id)
      .bind(owner_id)
      .bind(invited_user_id)
      .execute(db.pool())
      .await
      .expect("insert invitations");

      let snap = storage
        .get_workspace_members_snapshot(ws_id, owner_id, 0, 20, None)
        .await
        .expect("members snapshot");
      assert_eq!(snap["memberCount"], 4, "memberCount counts active + all invitations");
      let members = snap["members"].as_array().expect("members array");
      assert_eq!(
        members.len(),
        3,
        "unlinked pure-email invitation must be omitted from members"
      );
      let linked = members
        .iter()
        .find(|m| m["id"] == invited_user_id)
        .expect("linked invited user present");
      assert_eq!(linked["inviteId"], invited_user_id);
      assert_eq!(linked["status"], "Pending");

      // 100-CJK-char query (300 UTF-8 bytes, 100 UTF-16 code units) must succeed; 256-char query must fail.
      let cjk_100 = "中".repeat(100);
      assert!(
        storage
          .get_workspace_members_snapshot(ws_id, owner_id, 0, 20, Some(&cjk_100))
          .await
          .is_ok()
      );
      let too_long = "a".repeat(256);
      assert!(matches!(
        storage
          .get_workspace_members_snapshot(ws_id, owner_id, 0, 20, Some(&too_long))
          .await,
        Err(SyncError::QueryTooLong { max: 255 })
      ));

      // Quota snapshots emit lowercase snake_case plan, explicit copilotActionLimit key, and valid readonlyReasons.
      let user_q = storage
        .get_user_quota_state_snapshot(owner_id)
        .await
        .expect("user quota state");
      assert!(
        user_q["plan"]
          .as_str()
          .is_some_and(|p| p.chars().all(|c| c.is_ascii_lowercase() || c == '_')),
        "plan must be lowercase snake_case, got {user_q}"
      );
      assert!(
        user_q.as_object().unwrap().contains_key("copilotActionLimit"),
        "copilotActionLimit key must always be present"
      );

      let ws_q = storage
        .get_workspace_quota_state_snapshot(ws_id, owner_id)
        .await
        .expect("workspace quota state");
      assert!(
        ws_q["plan"]
          .as_str()
          .is_some_and(|p| p.chars().all(|c| c.is_ascii_lowercase() || c == '_')),
        "workspace plan must be lowercase snake_case, got {ws_q}"
      );
      for reason in ws_q["readonlyReasons"].as_array().expect("readonlyReasons array") {
        let r = reason.as_str().unwrap_or("");
        assert!(
          r == "member_overflow" || r == "storage_overflow",
          "unexpected readonly reason: {r}"
        );
      }
    });
  }
}
