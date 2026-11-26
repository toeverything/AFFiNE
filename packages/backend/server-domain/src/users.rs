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

const MAX_DELETE_USER_PASSES: usize = 4;

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
pub struct DeletedUserCleanup {
  pub deleted_workspace_ids: Vec<String>,
  pub blob_keys: Vec<(String, String)>,
  pub comment_attachment_keys: Vec<(String, String, String)>,
  pub avatar_url: Option<String>,
}

impl DeletedUserCleanup {
  pub fn is_empty(&self) -> bool {
    self.deleted_workspace_ids.is_empty()
      && self.blob_keys.is_empty()
      && self.comment_attachment_keys.is_empty()
      && self.avatar_url.is_none()
  }
}

#[derive(Clone, Debug)]
pub struct DeleteUserError {
  pub error: DomainError,
  pub partial_cleanup: Box<DeletedUserCleanup>,
}

impl std::fmt::Display for DeleteUserError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(f, "{}", self.error)
  }
}

impl std::error::Error for DeleteUserError {
  fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
    Some(&self.error)
  }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ListUsersFilter {
  pub skip: i32,
  pub first: i32,
  pub keyword: Option<String>,
  pub features: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminCreateUserInput {
  pub email: String,
  pub name: Option<String>,
  pub password: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BanUserResult {
  pub old_user_id: String,
  pub new_user: CurrentUserView,
  pub cleanup: DeletedUserCleanup,
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
    Ok(self.update_profile_with_created_at(user_id, input).await?.0)
  }

  pub async fn update_profile_with_created_at(
    &self,
    user_id: &str,
    input: UpdateProfileInput,
  ) -> Result<(CurrentUserView, DateTime<Utc>), DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin update_profile: {e}")))?;

    let row: Option<(bool, DateTime<Utc>)> =
      sqlx::query_as("SELECT disabled, created_at FROM users WHERE id = $1 FOR UPDATE")
        .bind(user_id)
        .fetch_optional(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("lock user for update_profile: {e}")))?;
    let Some((disabled, created_at)) = row else {
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
    Ok((view, created_at))
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
  ) -> Result<DeletedUserCleanup, DeleteUserError> {
    let mut cleanup = DeletedUserCleanup::default();
    match self
      .delete_user_inner(target_user_id, quota_gate, billing_spi, &mut cleanup)
      .await
    {
      Ok(()) => Ok(cleanup),
      Err(error) => Err(DeleteUserError {
        error,
        partial_cleanup: Box::new(cleanup),
      }),
    }
  }

  async fn delete_user_inner(
    &self,
    target_user_id: &str,
    quota_gate: &dyn server_spi::QuotaGate,
    billing_spi: &dyn server_spi::BillingSpi,
    cleanup: &mut DeletedUserCleanup,
  ) -> Result<(), DomainError> {
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
        let _ = tx.rollback().await;
        return Err(DomainError::NotFound("user not found".to_owned()));
      }
      assert_no_owned_team_workspace_in_tx(tx.tx_mut(), target_user_id, quota_gate, now).await?;
      let _ = tx.rollback().await;
    }

    // Phase 2: external billing hook with no DB connection/transaction held.
    billing_spi.on_pre_delete_user(target_user_id).await?;

    // Phase 3: bounded convergence loop matching v0.27.5 behavior. Delete each owned
    // personal workspace in its own short write transaction (re-checking Team status
    // with a fresh post-lock clock), then lock the user row only after no owned
    // workspaces remain.
    for _pass in 0..MAX_DELETE_USER_PASSES {
      let owned_ws_ids = {
        let mut conn = self
          .db
          .acquire_tiered(WorkloadTier::InteractiveRead)
          .await
          .map_err(|e| DomainError::Internal(format!("acquire delete_user workspace list: {e}")))?;
        sqlx::query_scalar::<_, String>(
          "SELECT workspace_id FROM workspace_members WHERE user_id = $1 AND role = 'owner' AND state = 'active' ORDER BY workspace_id ASC",
        )
        .bind(target_user_id)
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| DomainError::Internal(format!("list owned workspaces for delete: {e}")))?
      };

      for ws_id in owned_ws_ids {
        let mut ws_tx = self
          .db
          .begin_tiered(WorkloadTier::InteractiveWrite)
          .await
          .map_err(|e| DomainError::Internal(format!("begin delete_user workspace tx: {e}")))?;

        let deleted =
          match delete_owned_personal_workspace_in_tx(ws_tx.tx_mut(), target_user_id, &ws_id, quota_gate).await {
            Ok(res) => res,
            Err(err) => {
              let _ = ws_tx.rollback().await;
              return Err(err);
            }
          };
        if let Some((ws_blobs, ws_attachments)) = deleted {
          ws_tx
            .commit()
            .await
            .map_err(|e| DomainError::Internal(format!("commit delete_user workspace: {e}")))?;

          cleanup.deleted_workspace_ids.push(ws_id.clone());
          cleanup
            .blob_keys
            .extend(ws_blobs.into_iter().map(|key| (ws_id.clone(), key)));
          cleanup.comment_attachment_keys.extend(
            ws_attachments
              .into_iter()
              .map(|(doc_id, key)| (ws_id.clone(), doc_id, key)),
          );
        } else {
          let _ = ws_tx.rollback().await;
        }
      }

      // Final short write transaction for the user row. Never acquire workspace locks
      // while holding `users FOR UPDATE`; roll back and retry in the next pass if any
      // residual workspace appeared.
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
        .map_err(|e| DomainError::Internal(format!("lock user for delete: {e}")))?;
      let Some(user_row) = user_row else {
        let _ = tx.rollback().await;
        return Err(DomainError::NotFound("user not found".to_owned()));
      };
      let user_email: String = user_row.get("email");
      let avatar_url: Option<String> = user_row.get("avatar_url");

      let residual_ws_ids: Vec<String> = sqlx::query_scalar(
        "SELECT workspace_id FROM workspace_members WHERE user_id = $1 AND role = 'owner' AND state = 'active' ORDER BY workspace_id ASC",
      )
      .bind(target_user_id)
      .fetch_all(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("recheck owned workspaces for delete: {e}")))?;
      if !residual_ws_ids.is_empty() {
        let _ = tx.rollback().await;
        continue;
      }

      sqlx::query("DELETE FROM user_snapshots WHERE user_id = $1")
        .bind(target_user_id)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("delete user_snapshots: {e}")))?;
      sqlx::query(
        "DELETE FROM auth_sessions WHERE user_session_id IN (SELECT id FROM user_sessions WHERE user_id = $1)",
      )
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
           SET status = 'canceled',
               retention_state = 'anonymized',
               recipient_email = NULL,
               payload = NULL,
               canceled_at = $3,
               settled_at = $3,
               anonymized_at = $3,
               updated_at = $3
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
      cleanup.avatar_url = avatar_url;
      return Ok(());
    }

    Err(DomainError::Conflict(
      "user_workspaces_changed_during_delete".to_owned(),
    ))
  }
  pub async fn list_users(&self, filter: &ListUsersFilter) -> Result<Vec<CurrentUserView>, DomainError> {
    let limit = i64::from(filter.first.max(0));
    if limit == 0 {
      return Ok(Vec::new());
    }
    let offset = i64::from(filter.skip.max(0));
    let kw = filter
      .keyword
      .as_deref()
      .map(str::trim)
      .filter(|s| !s.is_empty())
      .map(|s| format!("%{s}%"));
    let feat_filter: Option<&[String]> = (!filter.features.is_empty()).then_some(filter.features.as_slice());
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::LongQuery)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin list_users: {e}")))?;
    let rows = sqlx::query(
      "SELECT u.id, u.name, u.email, u.avatar_url, u.disabled, (u.password IS NOT NULL) AS has_password, (u.email_verified IS NOT NULL) AS email_verified FROM users u WHERE ($1::text IS NULL OR u.email ILIKE $1 OR u.id LIKE $1) AND ($2::text[] IS NULL OR EXISTS (SELECT 1 FROM user_features uf WHERE uf.user_id = u.id AND uf.activated = true AND uf.name = ANY($2))) ORDER BY u.created_at ASC, u.id ASC LIMIT $3 OFFSET $4",
    )
    .bind(kw)
    .bind(feat_filter)
    .bind(limit)
    .bind(offset)
    .fetch_all(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("list users: {e}")))?;
    let user_ids: Vec<String> = rows.iter().map(|r| r.get("id")).collect();
    let mut features_by_user: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    if !user_ids.is_empty() {
      let feat_rows: Vec<(String, String)> = sqlx::query_as(
        r#"SELECT DISTINCT user_id, name FROM user_features
           WHERE user_id = ANY($1) AND activated = true AND (expired_at IS NULL OR expired_at > clock_timestamp())
           ORDER BY user_id ASC, name ASC"#,
      )
      .bind(&user_ids)
      .fetch_all(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("batch load user features: {e}")))?;
      for (uid, fname) in feat_rows {
        features_by_user.entry(uid).or_default().push(fname);
      }
    }
    let out = rows
      .into_iter()
      .map(|row| {
        let id: String = row.get("id");
        let features = features_by_user.remove(&id).unwrap_or_default();
        CurrentUserView {
          id,
          name: row.get("name"),
          email: row.get("email"),
          avatar_url: row.get("avatar_url"),
          disabled: row.get("disabled"),
          has_password: row.get("has_password"),
          email_verified: row.get("email_verified"),
          features,
        }
      })
      .collect();
    let _ = tx.rollback().await;
    Ok(out)
  }
  pub async fn count_users(&self, filter: &ListUsersFilter) -> Result<i64, DomainError> {
    let kw = filter
      .keyword
      .as_deref()
      .map(str::trim)
      .filter(|s| !s.is_empty())
      .map(|s| format!("%{s}%"));
    let feat_filter: Option<&[String]> = (!filter.features.is_empty()).then_some(filter.features.as_slice());
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::LongQuery)
      .await
      .map_err(|e| DomainError::Unavailable(format!("acquire count_users: {e}")))?;
    sqlx::query_scalar(
      "SELECT COUNT(*)::bigint FROM users u WHERE ($1::text IS NULL OR u.email ILIKE $1 OR u.id LIKE $1) AND ($2::text[] IS NULL OR EXISTS (SELECT 1 FROM user_features uf WHERE uf.user_id = u.id AND uf.activated = true AND uf.name = ANY($2)))",
    )
    .bind(kw)
    .bind(feat_filter)
    .fetch_one(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("count users: {e}")))
  }
  pub async fn get_user_by_id_admin(&self, user_id: &str) -> Result<Option<CurrentUserView>, DomainError> {
    self.get_current_user(user_id).await
  }
  pub async fn get_user_by_email_admin(&self, email: &str) -> Result<Option<CurrentUserView>, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin get_user_by_email_admin: {e}")))?;
    let target_id: Option<String> =
      sqlx::query_scalar("SELECT id FROM users WHERE lower(email) = lower($1) ORDER BY id LIMIT 1")
        .bind(email.trim())
        .fetch_optional(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("lookup admin user by email: {e}")))?;
    let view = match target_id {
      Some(id) => load_current_user_in_tx(tx.tx_mut(), &id).await?,
      None => None,
    };
    let _ = tx.rollback().await;
    Ok(view)
  }
  pub async fn create_user(
    &self,
    input: &AdminCreateUserInput,
    password_min_len: usize,
    password_max_len: usize,
  ) -> Result<CurrentUserView, DomainError> {
    let email = crate::auth::canonical_email(&input.email)?;
    let password_hash = match input.password.as_deref() {
      Some(pw) if !pw.is_empty() => {
        crate::auth::password::validate_password_requirements(pw, password_min_len, password_max_len)?;
        let pw_owned = pw.to_owned();
        let hashed = tokio::task::spawn_blocking(move || crate::auth::password::hash_password(&pw_owned))
          .await
          .map_err(|e| DomainError::Internal(format!("password hash task failed: {e}")))??;
        Some(hashed)
      }
      _ => None,
    };
    let name = input
      .name
      .as_deref()
      .map(str::trim)
      .filter(|s| !s.is_empty())
      .map(ToOwned::to_owned)
      .unwrap_or_else(|| email.split('@').next().unwrap_or("User").to_owned());
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin create_user: {e}")))?;
    lock_email_in_tx(tx.tx_mut(), &email).await?;
    let existing: Option<String> = sqlx::query_scalar("SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1")
      .bind(&email)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("check existing user email: {e}")))?;
    if existing.is_some() {
      let _ = tx.rollback().await;
      return Err(DomainError::Conflict(format!("email_already_used:{email}")));
    }
    let user_id = uuid::Uuid::new_v4().to_string();
    let res = sqlx::query(
      "INSERT INTO users (id, name, email, password, registered, disabled) VALUES ($1, $2, $3, $4, true, false)",
    )
    .bind(&user_id)
    .bind(&name)
    .bind(&email)
    .bind(&password_hash)
    .execute(&mut **tx.tx_mut())
    .await;
    if let Err(err) = res {
      let _ = tx.rollback().await;
      if matches!(&err, sqlx::Error::Database(e) if e.code().as_deref() == Some("23505")) {
        return Err(DomainError::Conflict(format!("email_already_used:{email}")));
      }
      return Err(DomainError::Internal(format!("insert user: {err}")));
    }
    let view = load_current_user_in_tx(tx.tx_mut(), &user_id)
      .await?
      .ok_or_else(|| DomainError::Internal("created user missing".to_owned()))?;
    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit create_user: {e}")))?;
    Ok(view)
  }
  pub async fn import_users(
    &self,
    inputs: &[AdminCreateUserInput],
    password_min_len: usize,
    password_max_len: usize,
  ) -> Vec<Result<CurrentUserView, (String, DomainError)>> {
    let mut outcomes: Vec<Option<Result<CurrentUserView, (String, DomainError)>>> = vec![None; inputs.len()];
    let mut valid_indices: Vec<(String, usize)> = Vec::with_capacity(inputs.len());
    for (idx, item) in inputs.iter().enumerate() {
      match crate::auth::canonical_email(&item.email) {
        Ok(canon) => valid_indices.push((canon.to_ascii_lowercase(), idx)),
        Err(err) => outcomes[idx] = Some(Err((item.email.clone(), err))),
      }
    }
    valid_indices.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
    for (_, idx) in valid_indices {
      let item = &inputs[idx];
      outcomes[idx] = Some(
        self
          .create_user(item, password_min_len, password_max_len)
          .await
          .map_err(|err| (item.email.clone(), err)),
      );
    }
    outcomes
      .into_iter()
      .enumerate()
      .map(|(i, opt)| {
        opt.unwrap_or_else(|| {
          Err((
            inputs[i].email.clone(),
            DomainError::Internal("missing import result".into()),
          ))
        })
      })
      .collect()
  }
  pub async fn admin_update_user(
    &self,
    user_id: &str,
    email: Option<&str>,
    name: Option<&str>,
  ) -> Result<CurrentUserView, DomainError> {
    let parsed_new_email = match email {
      Some(raw) => Some(crate::auth::canonical_email(raw)?),
      None => None,
    };
    // Pre-read current email so we can lock both old and new emails in
    // deterministic sorted order before taking `users FOR UPDATE`.
    let mut pre_email: Option<String> = {
      let mut conn = self
        .db
        .acquire_tiered(WorkloadTier::InteractiveRead)
        .await
        .map_err(|e| DomainError::Unavailable(format!("acquire admin_update_user precheck: {e}")))?;
      sqlx::query_scalar("SELECT email FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(|e| DomainError::Internal(format!("precheck user email: {e}")))?
    };
    for _attempt in 0..3 {
      let mut tx = self
        .db
        .begin_tiered(WorkloadTier::InteractiveWrite)
        .await
        .map_err(|e| DomainError::Unavailable(format!("begin admin_update_user: {e}")))?;
      let mut emails_to_lock: Vec<String> = Vec::new();
      if let Some(ref cur) = pre_email {
        emails_to_lock.push(cur.to_ascii_lowercase());
      }
      if let Some(ref next) = parsed_new_email {
        let lowered = next.to_ascii_lowercase();
        if !emails_to_lock.contains(&lowered) {
          emails_to_lock.push(lowered);
        }
      }
      emails_to_lock.sort();
      for em in &emails_to_lock {
        lock_email_in_tx(tx.tx_mut(), em).await?;
      }
      let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
        .fetch_one(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("admin_update_user clock: {e}")))?;
      let existing_email: Option<String> = sqlx::query_scalar("SELECT email FROM users WHERE id = $1 FOR UPDATE")
        .bind(user_id)
        .fetch_optional(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("lock user for admin_update_user: {e}")))?;
      let Some(existing_email) = existing_email else {
        let _ = tx.rollback().await;
        return Err(DomainError::NotFound("user_not_found".to_owned()));
      };
      if !pre_email
        .as_deref()
        .is_some_and(|p| p.eq_ignore_ascii_case(&existing_email))
      {
        let _ = tx.rollback().await;
        pre_email = Some(existing_email);
        continue;
      }
      let raw_email_changed = email.is_some_and(|raw| raw.trim() != existing_email);
      if let Some(ref new_email) = parsed_new_email
        && (raw_email_changed || new_email != &existing_email)
      {
        let dup: Option<String> =
          sqlx::query_scalar("SELECT id FROM users WHERE lower(email) = lower($1) AND id <> $2 LIMIT 1")
            .bind(new_email)
            .bind(user_id)
            .fetch_optional(&mut **tx.tx_mut())
            .await
            .map_err(|e| DomainError::Internal(format!("check duplicate email on update: {e}")))?;
        if dup.is_some() {
          let _ = tx.rollback().await;
          return Err(DomainError::Conflict(format!("email_already_used:{new_email}")));
        }
        let res = sqlx::query(
          "UPDATE users SET email = $2, email_verified = clock_timestamp(), auth_epoch = auth_epoch + 1 WHERE id = $1",
        )
        .bind(user_id)
        .bind(new_email)
        .execute(&mut **tx.tx_mut())
        .await;
        if let Err(err) = res {
          let _ = tx.rollback().await;
          if let sqlx::Error::Database(db_err) = &err
            && db_err.code().as_deref() == Some("23505")
          {
            return Err(DomainError::Conflict(format!("email_already_used:{new_email}")));
          }
          return Err(DomainError::Internal(format!("update user email: {err}")));
        }
        revoke_all_user_sessions_in_tx(tx.tx_mut(), user_id, now).await?;
      }
      if let Some(new_name) = name {
        sqlx::query("UPDATE users SET name = $2 WHERE id = $1")
          .bind(user_id)
          .bind(new_name)
          .execute(&mut **tx.tx_mut())
          .await
          .map_err(|e| DomainError::Internal(format!("admin update user name: {e}")))?;
      }
      let view = load_current_user_in_tx(tx.tx_mut(), user_id)
        .await?
        .ok_or_else(|| DomainError::NotFound("user_not_found".to_owned()))?;
      tx.commit()
        .await
        .map_err(|e| DomainError::Internal(format!("commit admin_update_user: {e}")))?;
      return Ok(view);
    }
    Err(DomainError::Conflict("user_email_changed_concurrently".to_owned()))
  }
  /// Bans a user using exact `v0.27.5` `recreateForBan` semantics: removes owned
  /// personal workspaces, then inside a single PostgreSQL transaction deletes the
  /// original user and sessions and inserts a fresh disabled tombstone user with a
  /// brand new UUID and the same email.
  pub async fn ban_user(
    &self,
    target_user_id: &str,
    quota_gate: &dyn server_spi::QuotaGate,
    billing_spi: &dyn server_spi::BillingSpi,
  ) -> Result<BanUserResult, DeleteUserError> {
    let mut cleanup = DeletedUserCleanup::default();
    match self
      .ban_user_inner(target_user_id, quota_gate, billing_spi, &mut cleanup)
      .await
    {
      Ok(new_user) => Ok(BanUserResult {
        old_user_id: target_user_id.to_owned(),
        new_user,
        cleanup,
      }),
      Err(error) => Err(DeleteUserError {
        error,
        partial_cleanup: Box::new(cleanup),
      }),
    }
  }
  async fn ban_user_inner(
    &self,
    target_user_id: &str,
    quota_gate: &dyn server_spi::QuotaGate,
    billing_spi: &dyn server_spi::BillingSpi,
    cleanup: &mut DeletedUserCleanup,
  ) -> Result<CurrentUserView, DomainError> {
    {
      let mut tx = self
        .db
        .begin_tiered(WorkloadTier::InteractiveRead)
        .await
        .map_err(|e| DomainError::Internal(format!("begin ban_user check: {e}")))?;
      let (now, exists): (DateTime<Utc>, bool) =
        sqlx::query_as("SELECT clock_timestamp(), EXISTS(SELECT 1 FROM users WHERE id = $1)")
          .bind(target_user_id)
          .fetch_one(&mut **tx.tx_mut())
          .await
          .map_err(|e| DomainError::Internal(format!("check user exists for ban: {e}")))?;
      if !exists {
        let _ = tx.rollback().await;
        return Err(DomainError::NotFound("user_not_found".to_owned()));
      }
      assert_no_owned_team_workspace_in_tx(tx.tx_mut(), target_user_id, quota_gate, now).await?;
      let _ = tx.rollback().await;
    }
    billing_spi.on_pre_delete_user(target_user_id).await?;
    for _pass in 0..MAX_DELETE_USER_PASSES {
      let owned_ws_ids = {
        let mut conn = self
          .db
          .acquire_tiered(WorkloadTier::InteractiveRead)
          .await
          .map_err(|e| DomainError::Internal(format!("acquire delete_user workspace list: {e}")))?;
        sqlx::query_scalar::<_, String>(
          "SELECT workspace_id FROM workspace_members WHERE user_id = $1 AND role = 'owner' AND state = 'active' ORDER BY workspace_id ASC",
        )
        .bind(target_user_id)
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| DomainError::Internal(format!("list owned workspaces for delete: {e}")))?
      };
      for ws_id in owned_ws_ids {
        let mut ws_tx = self
          .db
          .begin_tiered(WorkloadTier::InteractiveWrite)
          .await
          .map_err(|e| DomainError::Internal(format!("begin delete_user workspace tx: {e}")))?;
        let deleted =
          match delete_owned_personal_workspace_in_tx(ws_tx.tx_mut(), target_user_id, &ws_id, quota_gate).await {
            Ok(res) => res,
            Err(err) => {
              let _ = ws_tx.rollback().await;
              return Err(err);
            }
          };
        if let Some((ws_blobs, ws_attachments)) = deleted {
          ws_tx
            .commit()
            .await
            .map_err(|e| DomainError::Internal(format!("commit delete_user workspace: {e}")))?;
          cleanup.deleted_workspace_ids.push(ws_id.clone());
          cleanup
            .blob_keys
            .extend(ws_blobs.into_iter().map(|key| (ws_id.clone(), key)));
          cleanup.comment_attachment_keys.extend(
            ws_attachments
              .into_iter()
              .map(|(doc_id, key)| (ws_id.clone(), doc_id, key)),
          );
        } else {
          let _ = ws_tx.rollback().await;
        }
      }
      let mut tx = self
        .db
        .begin_tiered(WorkloadTier::InteractiveWrite)
        .await
        .map_err(|e| DomainError::Internal(format!("begin ban_user recreate tx: {e}")))?;
      let Some(pre_email) = sqlx::query_scalar::<_, String>("SELECT email FROM users WHERE id = $1")
        .bind(target_user_id)
        .fetch_optional(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("precheck user email for ban: {e}")))?
      else {
        let _ = tx.rollback().await;
        return Err(DomainError::NotFound("user_not_found".to_owned()));
      };
      lock_email_in_tx(tx.tx_mut(), &pre_email).await?;
      let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
        .fetch_one(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("ban_user clock: {e}")))?;
      let Some(user_row) = sqlx::query(
        "SELECT id, name, email, password, email_verified, avatar_url, registered, created_at, auth_epoch FROM users WHERE id = $1 FOR UPDATE",
      )
      .bind(target_user_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock user for ban: {e}")))?
      else {
        let _ = tx.rollback().await;
        return Err(DomainError::NotFound("user_not_found".to_owned()));
      };
      let has_residual: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE user_id = $1 AND role = 'owner' AND state = 'active')",
      )
      .bind(target_user_id)
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("recheck owned workspaces for ban: {e}")))?;
      let user_email: String = user_row.get("email");
      if has_residual || !pre_email.eq_ignore_ascii_case(&user_email) {
        let _ = tx.rollback().await;
        continue;
      }
      let avatar_url: Option<String> = user_row.get("avatar_url");
      revoke_all_user_sessions_in_tx(tx.tx_mut(), target_user_id, now).await?;
      sqlx::query("DELETE FROM user_snapshots WHERE user_id = $1")
        .bind(target_user_id)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("ban delete user_snapshots: {e}")))?;
      sqlx::query(
        "UPDATE mail_deliveries SET status = 'canceled', retention_state = 'anonymized', recipient_email = NULL, payload = NULL, canceled_at = $3, settled_at = $3, anonymized_at = $3, updated_at = $3 WHERE status = 'queued' AND (recipient_user_id = $1 OR actor_user_id = $1 OR lower(recipient_email) = lower($2))",
      )
      .bind(target_user_id)
      .bind(&user_email)
      .bind(now)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("ban cancel mail_deliveries: {e}")))?;
      sqlx::query("DELETE FROM workspace_invitations WHERE invitee_user_id = $1 OR inviter_user_id = $1")
        .bind(target_user_id)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("ban delete invitations: {e}")))?;
      sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(target_user_id)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("ban delete old user: {e}")))?;
      let new_user_id = uuid::Uuid::new_v4().to_string();
      sqlx::query(
        "INSERT INTO users (id, name, email, password, email_verified, avatar_url, registered, created_at, disabled, auth_epoch) VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, true, $8)",
      )
      .bind(&new_user_id)
      .bind(user_row.get::<String, _>("name"))
      .bind(&user_email)
      .bind(user_row.get::<Option<String>, _>("password"))
      .bind(user_row.get::<Option<DateTime<Utc>>, _>("email_verified"))
      .bind(user_row.get::<bool, _>("registered"))
      .bind(user_row.get::<DateTime<Utc>, _>("created_at"))
      .bind(user_row.get::<i32, _>("auth_epoch").saturating_add(1))
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("ban insert tombstone user: {e}")))?;
      let new_view = load_current_user_in_tx(tx.tx_mut(), &new_user_id)
        .await?
        .ok_or_else(|| DomainError::Internal("banned tombstone user missing".to_owned()))?;
      tx.commit()
        .await
        .map_err(|e| DomainError::Internal(format!("commit ban_user: {e}")))?;
      cleanup.avatar_url = avatar_url;
      return Ok(new_view);
    }
    Err(DomainError::Conflict(
      "user_workspaces_changed_during_delete".to_owned(),
    ))
  }
  pub async fn enable_user(&self, user_id: &str) -> Result<CurrentUserView, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin enable_user: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("enable_user clock: {e}")))?;
    let locked: Option<String> = sqlx::query_scalar("SELECT id FROM users WHERE id = $1 FOR UPDATE")
      .bind(user_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock user for enable_user: {e}")))?;
    if locked.is_none() {
      let _ = tx.rollback().await;
      return Err(DomainError::NotFound("user_not_found".to_owned()));
    }
    sqlx::query("UPDATE users SET disabled = false, auth_epoch = auth_epoch + 1 WHERE id = $1")
      .bind(user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("enable user: {e}")))?;
    revoke_all_user_sessions_in_tx(tx.tx_mut(), user_id, now).await?;
    let view = load_current_user_in_tx(tx.tx_mut(), user_id)
      .await?
      .ok_or_else(|| DomainError::NotFound("user_not_found".to_owned()))?;
    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit enable_user: {e}")))?;
    Ok(view)
  }
  pub async fn update_user_features(&self, user_id: &str, features: &[String]) -> Result<Vec<String>, DomainError> {
    if let Some(bad) = features.iter().find(|f| f.as_str() != ADMIN_FEATURE_NAME) {
      return Err(DomainError::Validation(format!(
        "User feature {bad} is not configurable"
      )));
    }
    let enable_admin = features.iter().any(|f| f == ADMIN_FEATURE_NAME);
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin update_user_features: {e}")))?;
    if sqlx::query_scalar::<_, String>("SELECT id FROM users WHERE id = $1 FOR UPDATE")
      .bind(user_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock user for update_user_features: {e}")))?
      .is_none()
    {
      let _ = tx.rollback().await;
      return Err(DomainError::NotFound("user_not_found".to_owned()));
    }
    if enable_admin {
      let has_active: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM user_features WHERE user_id = $1 AND name = $2 AND activated = true AND (expired_at IS NULL OR expired_at > clock_timestamp()))",
      )
      .bind(user_id)
      .bind(ADMIN_FEATURE_NAME)
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("check existing user feature: {e}")))?;
      if !has_active {
        sqlx::query(
          "INSERT INTO user_features (user_id, name, type, reason, activated) VALUES ($1, $2, 0, 'admin panel', true)",
        )
        .bind(user_id)
        .bind(ADMIN_FEATURE_NAME)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("insert user feature: {e}")))?;
      }
    } else {
      sqlx::query("UPDATE user_features SET activated = false WHERE user_id = $1 AND name = $2 AND activated = true")
        .bind(user_id)
        .bind(ADMIN_FEATURE_NAME)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("deactivate user feature: {e}")))?;
    }
    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit update_user_features: {e}")))?;
    Ok(
      enable_admin
        .then(|| ADMIN_FEATURE_NAME.to_owned())
        .into_iter()
        .collect(),
    )
  }
}

async fn delete_owned_personal_workspace_in_tx(
  tx: &mut Transaction<'_, Postgres>,
  target_user_id: &str,
  ws_id: &str,
  quota_gate: &dyn server_spi::QuotaGate,
) -> Result<Option<(Vec<String>, Vec<(String, String)>)>, DomainError> {
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
    .bind(format!("storage-workspace:{ws_id}"))
    .execute(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("lock owned workspace storage for delete: {e}")))?;
  let ws_locked: Option<String> = sqlx::query_scalar("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE")
    .bind(ws_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("lock owned workspace for delete: {e}")))?;
  if ws_locked.is_none() {
    return Ok(None);
  }

  let still_owned: bool = sqlx::query_scalar(
    "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND role = 'owner' AND state = 'active')",
  )
  .bind(ws_id)
  .bind(target_user_id)
  .fetch_one(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("verify workspace ownership for delete: {e}")))?;
  if !still_owned {
    return Ok(None);
  }

  let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
    .fetch_one(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("delete_user workspace clock: {e}")))?;
  let grant = quota_gate.resolve_workspace_grant(tx, ws_id, now).await?;
  if grant.billing_subject == server_spi::BillingSubject::Workspace {
    return Err(DomainError::Validation(
      "cannot_delete_account_with_owned_team_workspace".to_owned(),
    ));
  }

  let ws_blobs: Vec<String> = sqlx::query_scalar("SELECT key FROM blobs WHERE workspace_id = $1")
    .bind(ws_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("list owned workspace blobs for delete: {e}")))?;
  let ws_attachments: Vec<(String, String)> =
    sqlx::query_as("SELECT doc_id, key FROM comment_attachments WHERE workspace_id = $1")
      .bind(ws_id)
      .fetch_all(&mut **tx)
      .await
      .map_err(|e| DomainError::Internal(format!("list owned workspace comment attachments for delete: {e}")))?;

  sqlx::query("DELETE FROM snapshot_histories WHERE workspace_id = $1")
    .bind(ws_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("delete owned workspace snapshot_histories: {e}")))?;
  sqlx::query("DELETE FROM updates WHERE workspace_id = $1")
    .bind(ws_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("delete owned workspace updates: {e}")))?;
  sqlx::query("DELETE FROM snapshots WHERE workspace_id = $1")
    .bind(ws_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("delete owned workspace snapshots: {e}")))?;
  sqlx::query("DELETE FROM workspaces WHERE id = $1")
    .bind(ws_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("delete owned workspace: {e}")))?;

  Ok(Some((ws_blobs, ws_attachments)))
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

pub(crate) async fn lock_email_in_tx(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  email: &str,
) -> Result<(), DomainError> {
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended(lower($1), 8301))")
    .bind(email)
    .execute(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("lock invite email: {e}")))?;
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('auth:email:' || lower($1), 0))")
    .bind(email)
    .execute(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("lock auth email: {e}")))?;
  Ok(())
}

async fn revoke_all_user_sessions_in_tx(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  user_id: &str,
  now: DateTime<Utc>,
) -> Result<(), DomainError> {
  let user_session_ids: Vec<String> =
    sqlx::query_scalar("SELECT id FROM user_sessions WHERE user_id = $1 ORDER BY id ASC FOR UPDATE")
      .bind(user_id)
      .fetch_all(&mut **tx)
      .await
      .map_err(|e| DomainError::Internal(format!("lock user_sessions: {e}")))?;
  if user_session_ids.is_empty() {
    return Ok(());
  }
  let auth_session_ids: Vec<String> =
    sqlx::query_scalar("SELECT id FROM auth_sessions WHERE user_session_id = ANY($1) ORDER BY id ASC FOR UPDATE")
      .bind(&user_session_ids)
      .fetch_all(&mut **tx)
      .await
      .map_err(|e| DomainError::Internal(format!("lock auth_sessions: {e}")))?;
  if !auth_session_ids.is_empty() {
    sqlx::query(
      "SELECT id FROM auth_refresh_tokens WHERE auth_session_id = ANY($1) AND revoked_at IS NULL ORDER BY id ASC FOR UPDATE",
    )
    .bind(&auth_session_ids)
    .fetch_all(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("lock auth_refresh_tokens: {e}")))?;
    sqlx::query("UPDATE auth_refresh_tokens SET revoked_at = $2, successor_ciphertext = NULL, successor_expires_at = NULL WHERE auth_session_id = ANY($1) AND revoked_at IS NULL")
      .bind(&auth_session_ids)
      .bind(now)
      .execute(&mut **tx)
      .await
      .map_err(|e| DomainError::Internal(format!("revoke auth_refresh_tokens: {e}")))?;
    sqlx::query("UPDATE auth_sessions SET revoked_at = $2, revoke_reason = 'admin_user_lifecycle' WHERE id = ANY($1) AND revoked_at IS NULL")
      .bind(&auth_session_ids)
      .bind(now)
      .execute(&mut **tx)
      .await
      .map_err(|e| DomainError::Internal(format!("revoke auth_sessions: {e}")))?;
  }
  sqlx::query("DELETE FROM user_sessions WHERE id = ANY($1)")
    .bind(&user_session_ids)
    .execute(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("delete user_sessions: {e}")))?;
  Ok(())
}
