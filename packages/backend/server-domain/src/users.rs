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
