//! Canonical user records, current-user views, and feature lookups.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use server_db::{ServerDb, WorkloadTier};
use server_types::DomainError;
use sqlx::{Postgres, Row, Transaction};

pub const ADMIN_FEATURE_NAME: &str = "administrator";

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserRecord {
  pub id: String,
  pub name: String,
  pub email: String,
  pub avatar_url: Option<String>,
  pub disabled: bool,
  pub registered: bool,
  pub auth_epoch: i32,
  pub has_password: bool,
  pub email_verified: bool,
  pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentUserView {
  pub id: String,
  pub name: String,
  pub email: String,
  pub avatar_url: Option<String>,
  pub disabled: bool,
  pub has_password: bool,
  pub email_verified: bool,
  pub features: Vec<String>,
}

impl CurrentUserView {
  pub fn is_admin(&self) -> bool {
    self
      .features
      .iter()
      .any(|feature| feature == ADMIN_FEATURE_NAME || feature == "Admin")
  }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicUserView {
  pub id: String,
  pub name: String,
  pub avatar_url: Option<String>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct UpdateProfileInput {
  pub name: Option<String>,
  pub avatar_url: Option<Option<String>>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserSettings {
  #[serde(default = "default_true")]
  pub receive_invitation_email: bool,
  #[serde(default = "default_true")]
  pub receive_mention_email: bool,
  #[serde(default = "default_true")]
  pub receive_comment_email: bool,
}

fn default_true() -> bool {
  true
}

impl Default for UserSettings {
  fn default() -> Self {
    Self {
      receive_invitation_email: true,
      receive_mention_email: true,
      receive_comment_email: true,
    }
  }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct UpdateUserSettingsInput {
  pub receive_invitation_email: Option<bool>,
  pub receive_mention_email: Option<bool>,
  pub receive_comment_email: Option<bool>,
}

#[derive(Clone, Debug, Default)]
pub struct DeletedUserCleanup {
  pub deleted_workspace_ids: Vec<String>,
  pub blob_keys: Vec<(String, String)>,
  pub comment_attachment_keys: Vec<(String, String, String)>,
  pub avatar_url: Option<String>,
}

#[derive(Clone)]
pub struct UserService {
  db: ServerDb,
}

impl UserService {
  pub fn new(db: ServerDb) -> Self {
    Self { db }
  }

  pub async fn get_current_user(&self, user_id: &str) -> Result<Option<CurrentUserView>, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("begin get_current_user: {e}")))?;
    let view = load_current_user_in_tx(tx.tx_mut(), user_id).await?;
    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit get_current_user: {e}")))?;
    Ok(view)
  }

  pub async fn get_public_user(&self, user_id: &str) -> Result<Option<PublicUserView>, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire get_public_user: {e}")))?;
    let row = sqlx::query("SELECT id, name, avatar_url FROM users WHERE id = $1 AND disabled = false")
      .bind(user_id)
      .fetch_optional(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("load public user: {e}")))?;
    Ok(row.map(|r| PublicUserView {
      id: r.get("id"),
      name: r.get("name"),
      avatar_url: r.get("avatar_url"),
    }))
  }

  pub async fn get_user_by_email_for_actor(
    &self,
    actor_user_id: &str,
    email: &str,
  ) -> Result<Option<CurrentUserView>, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("begin get_user_by_email_for_actor: {e}")))?;
    let target_id: Option<String> = sqlx::query_scalar(
      "SELECT id FROM users WHERE lower(email) = lower($1) AND disabled = false ORDER BY id LIMIT 1",
    )
    .bind(email.trim())
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("lookup user by email: {e}")))?;
    let Some(target_id) = target_id else {
      return Ok(None);
    };
    if target_id != actor_user_id {
      let shared: bool = sqlx::query_scalar(
        r#"SELECT EXISTS(
             SELECT 1
             FROM workspace_members m1
             JOIN workspace_members m2 ON m1.workspace_id = m2.workspace_id
             WHERE m1.user_id = $1 AND m1.state = 'active'
               AND m2.user_id = $2 AND m2.state = 'active'
           )"#,
      )
      .bind(actor_user_id)
      .bind(&target_id)
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("check shared workspace: {e}")))?;
      if !shared {
        return Ok(None);
      }
    }
    let view = load_current_user_in_tx(tx.tx_mut(), &target_id).await?;
    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit get_user_by_email_for_actor: {e}")))?;
    Ok(view)
  }

  pub async fn update_profile(&self, user_id: &str, input: UpdateProfileInput) -> Result<CurrentUserView, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin update_profile: {e}")))?;

    let exists: Option<bool> = sqlx::query_scalar("SELECT disabled FROM users WHERE id = $1 FOR UPDATE")
      .bind(user_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock user for update_profile: {e}")))?;
    let Some(disabled) = exists else {
      return Err(DomainError::NotFound("user not found".to_owned()));
    };
    if disabled {
      return Err(DomainError::Forbidden("user is disabled".to_owned()));
    }

    if let Some(name) = input.name {
      sqlx::query("UPDATE users SET name = $2 WHERE id = $1")
        .bind(user_id)
        .bind(name)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("update user name: {e}")))?;
    }
    if let Some(avatar_url) = input.avatar_url {
      sqlx::query("UPDATE users SET avatar_url = $2 WHERE id = $1")
        .bind(user_id)
        .bind(avatar_url)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("update user avatar_url: {e}")))?;
    }

    let view = load_current_user_in_tx(tx.tx_mut(), user_id)
      .await?
      .ok_or_else(|| DomainError::NotFound("user not found".to_owned()))?;
    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit update_profile: {e}")))?;
    Ok(view)
  }

  pub async fn get_by_email(&self, email: &str) -> Result<Option<UserRecord>, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire get_by_email: {e}")))?;
    let row = sqlx::query(
      r#"SELECT id, name, email, avatar_url, disabled, registered, auth_epoch,
                (password IS NOT NULL) AS has_password,
                (email_verified IS NOT NULL) AS email_verified,
                created_at
         FROM users
         WHERE lower(email) = lower($1)
         ORDER BY id
         LIMIT 1"#,
    )
    .bind(email.trim())
    .fetch_optional(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("load user by email: {e}")))?;

    Ok(row.map(|row| UserRecord {
      id: row.get("id"),
      name: row.get("name"),
      email: row.get("email"),
      avatar_url: row.get("avatar_url"),
      disabled: row.get("disabled"),
      registered: row.get("registered"),
      auth_epoch: row.get("auth_epoch"),
      has_password: row.get("has_password"),
      email_verified: row.get("email_verified"),
      created_at: row.get("created_at"),
    }))
  }

  pub async fn get_settings(&self, user_id: &str) -> Result<UserSettings, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire get_settings: {e}")))?;
    let payload: Option<sqlx::types::Json<serde_json::Value>> =
      sqlx::query_scalar("SELECT payload FROM user_settings WHERE user_id = $1")
        .bind(user_id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(|e| DomainError::Internal(format!("load user settings: {e}")))?;
    let Some(sqlx::types::Json(val)) = payload else {
      return Ok(UserSettings::default());
    };
    Ok(serde_json::from_value(val).unwrap_or_default())
  }

  pub async fn update_settings(
    &self,
    user_id: &str,
    input: UpdateUserSettingsInput,
  ) -> Result<UserSettings, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin update_settings: {e}")))?;
    let existing: Option<sqlx::types::Json<serde_json::Value>> =
      sqlx::query_scalar("SELECT payload FROM user_settings WHERE user_id = $1 FOR UPDATE")
        .bind(user_id)
        .fetch_optional(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("lock user settings: {e}")))?;
    let mut current: UserSettings = existing
      .and_then(|j| serde_json::from_value(j.0).ok())
      .unwrap_or_default();
    if let Some(v) = input.receive_invitation_email {
      current.receive_invitation_email = v;
    }
    if let Some(v) = input.receive_mention_email {
      current.receive_mention_email = v;
    }
    if let Some(v) = input.receive_comment_email {
      current.receive_comment_email = v;
    }
    let payload =
      serde_json::to_value(current).map_err(|e| DomainError::Internal(format!("serialize user settings: {e}")))?;
    sqlx::query(
      r#"INSERT INTO user_settings (user_id, payload, created_at, updated_at)
         VALUES ($1, $2, now(), now())
         ON CONFLICT (user_id) DO UPDATE SET
           payload = EXCLUDED.payload,
           updated_at = now()"#,
    )
    .bind(user_id)
    .bind(sqlx::types::Json(payload))
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("upsert user settings: {e}")))?;
    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit update_settings: {e}")))?;
    Ok(current)
  }

  pub async fn delete_user(
    &self,
    target_user_id: &str,
    quota_gate: &dyn server_spi::QuotaGate,
    billing_spi: &dyn server_spi::BillingSpi,
  ) -> Result<DeletedUserCleanup, DomainError> {
    // Phase 1: short read transaction (released before external billing I/O).
    {
      let mut tx = self
        .db
        .begin_tiered(WorkloadTier::InteractiveRead)
        .await
        .map_err(|e| DomainError::Internal(format!("begin delete_user check: {e}")))?;
      let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
        .fetch_one(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("delete_user check clock: {e}")))?;
      let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)")
        .bind(target_user_id)
        .fetch_one(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("check user exists for delete: {e}")))?;
      if !exists {
        return Err(DomainError::NotFound("user not found".to_owned()));
      }
      assert_no_owned_team_workspace_in_tx(tx.tx_mut(), target_user_id, quota_gate, now).await?;
      let _ = tx.rollback().await;
    }

    // Phase 2: external billing hook with no DB connection/transaction held.
    billing_spi.on_pre_delete_user(target_user_id).await?;

    // Phase 3: short write transaction with FOR UPDATE lock, TOCTOU re-check,
    // and full cascade cleanup of personal workspaces, userspace docs, sessions,
    // pending mail deliveries, and invitations.
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin delete_user: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("delete_user clock: {e}")))?;
    let user_row = sqlx::query("SELECT id, email, avatar_url FROM users WHERE id = $1 FOR UPDATE")
      .bind(target_user_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock user for delete: {e}")))?
      .ok_or_else(|| DomainError::NotFound("user not found".to_owned()))?;
    let user_email: String = user_row.get("email");
    let avatar_url: Option<String> = user_row.get("avatar_url");

    let owned_ws_ids = assert_no_owned_team_workspace_in_tx(tx.tx_mut(), target_user_id, quota_gate, now).await?;

    let mut cleanup = DeletedUserCleanup {
      deleted_workspace_ids: Vec::with_capacity(owned_ws_ids.len()),
      blob_keys: Vec::new(),
      comment_attachment_keys: Vec::new(),
      avatar_url,
    };

    for ws_id in owned_ws_ids {
      sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
        .bind(format!("storage-workspace:{ws_id}"))
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("lock owned workspace storage for delete: {e}")))?;
      let ws_locked: Option<String> = sqlx::query_scalar("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE")
        .bind(&ws_id)
        .fetch_optional(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("lock owned workspace for delete: {e}")))?;
      if ws_locked.is_none() {
        continue;
      }

      let ws_blobs: Vec<String> = sqlx::query_scalar("SELECT key FROM blobs WHERE workspace_id = $1")
        .bind(&ws_id)
        .fetch_all(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("list owned workspace blobs for delete: {e}")))?;
      for k in ws_blobs {
        cleanup.blob_keys.push((ws_id.clone(), k));
      }
      let ws_attachments: Vec<(String, String)> =
        sqlx::query_as("SELECT doc_id, key FROM comment_attachments WHERE workspace_id = $1")
          .bind(&ws_id)
          .fetch_all(&mut **tx.tx_mut())
          .await
          .map_err(|e| DomainError::Internal(format!("list owned workspace comment attachments for delete: {e}")))?;
      for (doc_id, k) in ws_attachments {
        cleanup.comment_attachment_keys.push((ws_id.clone(), doc_id, k));
      }

      sqlx::query("DELETE FROM snapshot_histories WHERE workspace_id = $1")
        .bind(&ws_id)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("delete owned workspace snapshot_histories: {e}")))?;
      sqlx::query("DELETE FROM updates WHERE workspace_id = $1")
        .bind(&ws_id)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("delete owned workspace updates: {e}")))?;
      sqlx::query("DELETE FROM snapshots WHERE workspace_id = $1")
        .bind(&ws_id)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("delete owned workspace snapshots: {e}")))?;
      sqlx::query("DELETE FROM workspaces WHERE id = $1")
        .bind(&ws_id)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("delete owned workspace: {e}")))?;
      cleanup.deleted_workspace_ids.push(ws_id);
    }

    sqlx::query("DELETE FROM user_snapshots WHERE user_id = $1")
      .bind(target_user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("delete user_snapshots: {e}")))?;
    sqlx::query("DELETE FROM auth_sessions WHERE user_session_id IN (SELECT id FROM user_sessions WHERE user_id = $1)")
      .bind(target_user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("delete auth_sessions: {e}")))?;
    sqlx::query("DELETE FROM user_sessions WHERE user_id = $1")
      .bind(target_user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("delete user_sessions: {e}")))?;
    sqlx::query(
      r#"UPDATE mail_deliveries
         SET status = 'canceled', canceled_at = $3, updated_at = $3
         WHERE status = 'queued'
           AND (recipient_user_id = $1 OR actor_user_id = $1 OR lower(recipient_email) = lower($2))"#,
    )
    .bind(target_user_id)
    .bind(&user_email)
    .bind(now)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("cancel pending user mail_deliveries: {e}")))?;
    sqlx::query("DELETE FROM workspace_invitations WHERE invitee_user_id = $1 OR inviter_user_id = $1")
      .bind(target_user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("delete user workspace invitations: {e}")))?;
    sqlx::query("DELETE FROM users WHERE id = $1")
      .bind(target_user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("delete user: {e}")))?;
    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit delete_user: {e}")))?;
    Ok(cleanup)
  }
}

async fn assert_no_owned_team_workspace_in_tx(
  tx: &mut Transaction<'_, Postgres>,
  user_id: &str,
  quota_gate: &dyn server_spi::QuotaGate,
  now: DateTime<Utc>,
) -> Result<Vec<String>, DomainError> {
  let owned_ws_ids: Vec<String> = sqlx::query_scalar(
    "SELECT workspace_id FROM workspace_members WHERE user_id = $1 AND role = 'owner' AND state = 'active' ORDER BY workspace_id ASC",
  )
  .bind(user_id)
  .fetch_all(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("list owned workspaces for delete: {e}")))?;
  for ws_id in &owned_ws_ids {
    let grant = quota_gate.resolve_workspace_grant(tx, ws_id, now).await?;
    if grant.billing_subject == server_spi::BillingSubject::Workspace {
      return Err(DomainError::Validation(
        "cannot_delete_account_with_owned_team_workspace".to_owned(),
      ));
    }
  }
  Ok(owned_ws_ids)
}

pub(crate) async fn load_current_user_in_tx(
  tx: &mut Transaction<'_, Postgres>,
  user_id: &str,
) -> Result<Option<CurrentUserView>, DomainError> {
  let row = sqlx::query(
    r#"SELECT id, name, email, avatar_url, disabled,
              (password IS NOT NULL) AS has_password,
              (email_verified IS NOT NULL) AS email_verified
       FROM users
       WHERE id = $1"#,
  )
  .bind(user_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("load current user: {e}")))?;

  let Some(row) = row else {
    return Ok(None);
  };

  let features: Vec<String> = sqlx::query_scalar(
    r#"SELECT DISTINCT name
       FROM user_features
       WHERE user_id = $1
         AND activated = true
         AND (expired_at IS NULL OR expired_at > clock_timestamp())
       ORDER BY name ASC"#,
  )
  .bind(user_id)
  .fetch_all(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("load user features: {e}")))?;

  Ok(Some(CurrentUserView {
    id: row.get("id"),
    name: row.get("name"),
    email: row.get("email"),
    avatar_url: row.get("avatar_url"),
    disabled: row.get("disabled"),
    has_password: row.get("has_password"),
    email_verified: row.get("email_verified"),
    features,
  }))
}
